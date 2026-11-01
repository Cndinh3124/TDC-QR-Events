// Quy trinh ho so hoat dong - dac ta quan-ly-hoat-dong 4.1:
//   Nhap -> (nop) Cho duyet ke hoach -> (duyet) Dang trien khai -> (nop ket qua) Cho danh gia -> (danh gia) Da danh gia -> (khen thuong) Da chot
// Khoa nop; chi Doan truong duyet / tra lai / danh gia / khen thuong. Moi buoc ghi lich su, thong bao va nhat ky.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { ApiResult } from '../common/api-result';
import { Err } from '../common/errors';
import { ActivitiesService } from './activities.service';
import { assertTransition, STATUS_LABEL, WorkflowAction as Action } from './activity-rules';
import { ActivityDto, BulkEvaluateDto, EvaluateDto, RewardDto } from './dto/activity.dto';
import { AcademicYear } from './entities/academic-year.entity';
import { Activity, Reward } from './entities/activity.entity';
import { ActivityLink, WorkflowAction } from './entities/activity-parts.entity';
import { NotificationsService } from './notifications.service';

interface Step {
  action: Action;
  // QTV truong moi lam duoc (duyet, tra lai, danh gia, khen thuong, mo khoa)
  adminOnly: boolean;
  // thong bao: gui cho quan ly don vi hay cho Doan truong
  to: 'UNIT' | 'ADMINS';
  message: (a: Activity) => string;
  apply: (a: Activity, m: EntityManager, now: Date) => Promise<string | null> | string | null; // tra ve ghi chu cho lich su
  version: string;
}

export interface BulkResult { done: string[]; failed: Array<{ id: string; message: string }> }

@Injectable()
export class ActivityWorkflowService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly activities: ActivitiesService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  submit(actor: CurrentUser, id: string) {
    return this.run(actor, id, {
      action: 'SUBMIT', adminOnly: false, to: 'ADMINS', version: 'SUBMIT',
      message: (a) => `Hồ sơ ${a.code} chờ duyệt kế hoạch: ${a.name}`,
      apply: (a, _m, now) => {
        // [NV] 3.1: link ke hoach la thong tin bat buoc cua ho so ke hoach
        if (!a.planUrl) throw Err.bad('PLAN_URL_REQUIRED', 'Cần có link kế hoạch trước khi nộp.');
        a.status = 'PENDING_PLAN'; a.submittedAt = now; a.returnNote = null; a.returnedAt = null;
        return null;
      },
    });
  }

  approve(actor: CurrentUser, id: string) {
    return this.run(actor, id, {
      action: 'APPROVE', adminOnly: true, to: 'UNIT', version: 'APPROVE',
      message: (a) => `Kế hoạch ${a.code} đã được duyệt, bắt đầu triển khai: ${a.name}`,
      apply: (a) => { a.status = 'IN_PROGRESS'; return null; },
    });
  }

  // tra lai bo sung: tu "Cho duyet ke hoach" ve Nhap, tu "Cho danh gia" ve Dang trien khai; bat buoc noi dung
  returnBack(actor: CurrentUser, id: string, note: string) {
    return this.run(actor, id, {
      action: 'RETURN', adminOnly: true, to: 'UNIT', version: 'RETURN',
      message: (a) => `Hồ sơ ${a.code} bị trả lại để bổ sung: ${note.slice(0, 120)}`,
      apply: (a, _m, now) => {
        a.status = a.status === 'PENDING_PLAN' ? 'DRAFT' : 'IN_PROGRESS';
        a.returnNote = note; a.returnedAt = now;
        return note;
      },
    });
  }

  submitResult(actor: CurrentUser, id: string) {
    return this.run(actor, id, {
      action: 'SUBMIT_RESULT', adminOnly: false, to: 'ADMINS', version: 'SUBMIT_RESULT',
      message: (a) => `Hồ sơ ${a.code} đã nộp kết quả, chờ đánh giá: ${a.name}`,
      apply: async (a, m) => {
        // [NV] 4.1: nop ket qua phai kem it nhat mot duong dan bao cao
        const n = await m.count(ActivityLink, { where: { activityId: a.id, group: 'RESULT' } });
        if (n === 0) throw Err.bad('RESULT_REQUIRED', 'Cần có ít nhất một đường dẫn báo cáo kết quả trước khi nộp.');
        a.status = 'PENDING_EVAL'; a.returnNote = null; a.returnedAt = null;
        return null;
      },
    });
  }

  evaluate(actor: CurrentUser, id: string, dto: EvaluateDto) {
    // [NV] 4.1: "Chua hoan thanh" bat buoc co nhan xet
    if (dto.result === 'NOT_COMPLETED' && !(dto.note && dto.note.length >= 3)) {
      throw Err.bad('NOTE_REQUIRED', 'Đánh giá "Chưa hoàn thành" cần có nhận xét.');
    }
    return this.run(actor, id, {
      action: 'EVALUATE', adminOnly: true, to: 'UNIT', version: 'EVALUATE',
      message: (a) => `Hồ sơ ${a.code} đã được đánh giá: ${dto.result === 'COMPLETED' ? 'Hoàn thành' : 'Chưa hoàn thành'}`,
      apply: (a, _m, now) => {
        a.status = 'EVALUATED'; a.evaluation = dto.result; a.evaluationNote = dto.note ?? null; a.evaluatedBy = actor.id; a.evaluatedAt = now;
        return dto.note ?? null;
      },
    });
  }

  reward(actor: CurrentUser, id: string, dto: RewardDto) {
    if (dto.result === 'REJECTED' && !(dto.note && dto.note.length >= 3)) {
      throw Err.bad('NOTE_REQUIRED', 'Không duyệt khen thưởng cần ghi lý do.');
    }
    return this.run(actor, id, {
      action: 'REWARD', adminOnly: true, to: 'UNIT', version: 'REWARD',
      message: (a) => `Hồ sơ ${a.code}: khen thưởng ${dto.result === 'APPROVED' ? 'được duyệt' : 'không được duyệt'}, hồ sơ đã chốt`,
      apply: (a, _m, now) => {
        // [NV] 4.1 (da chot): chi khen thuong hoat dong da danh gia "Hoan thanh"
        if (dto.result === 'APPROVED' && a.evaluation !== 'COMPLETED') {
          throw Err.conflict('REWARD_NEEDS_COMPLETED', 'Chỉ khen thưởng hoạt động đã được đánh giá "Hoàn thành".');
        }
        a.status = 'LOCKED'; a.reward = dto.result as Reward; a.rewardNote = dto.note ?? null; a.lockedAt = now;
        return dto.note ?? null;
      },
    });
  }

  // mo lai ho so da chot de sua danh gia / khen thuong: chi Doan truong, bat buoc ly do
  reopen(actor: CurrentUser, id: string, reason: string) {
    return this.run(actor, id, {
      action: 'REOPEN', adminOnly: true, to: 'UNIT', version: 'REOPEN',
      message: (a) => `Hồ sơ ${a.code} được mở lại để chỉnh đánh giá / khen thưởng`,
      apply: (a) => { a.status = 'EVALUATED'; a.reward = null; a.rewardNote = null; a.lockedAt = null; return reason; },
    });
  }

  // hang loat: tung ho so mot giao dich rieng; ho so loi khong lam hong cac ho so con lai
  bulkApprove(actor: CurrentUser, ids: string[]) {
    return this.bulk(ids, (id) => this.approve(actor, id));
  }

  bulkEvaluate(actor: CurrentUser, dto: BulkEvaluateDto) {
    return this.bulk(dto.ids, (id) => this.evaluate(actor, id, { result: dto.result, note: dto.note }));
  }

  private async bulk(ids: string[], one: (id: string) => Promise<ActivityDto>): Promise<BulkResult> {
    const out: BulkResult = { done: [], failed: [] };
    for (const id of ids) {
      try {
        await one(id);
        out.done.push(id);
      } catch (e) {
        const r = (e as { getResponse?: () => ApiResult }).getResponse?.();
        out.failed.push({ id, message: r?.message ?? 'Không thực hiện được.' });
      }
    }
    return out;
  }

  // khung chung cho moi buoc: khoa dong -> kiem tra quyen / nam hoc / trang thai -> ap dung -> ghi lich su + thong bao
  private async run(actor: CurrentUser, id: string, step: Step): Promise<ActivityDto> {
    if (step.adminOnly && actor.role !== 'SCHOOL_ADMIN') throw Err.forbidden();
    const summary = await this.ds.transaction(async (m) => {
      const { activity: a } = await this.activities.load(m, actor, id, 'manage', true);
      const year = await m.findOneOrFail(AcademicYear, { where: { id: a.academicYearId } });
      this.activities.assertYearOpen(year);
      assertTransition(step.action, a.status);

      const before = await this.activities.snapshotOf(m, a);
      const from = a.status;
      const now = new Date();
      const note = await step.apply(a, m, now);
      await m.save(a);
      await this.activities.recordVersion(m, a, step.version, actor.id, before);
      await m.save(m.create(WorkflowAction, { id: randomUUID(), entityType: 'activity', entityId: a.id, action: step.action, actorId: actor.id, note, createdAt: now }));

      const to = step.to === 'ADMINS' ? await this.notify.admins(m) : await this.notify.unitManagers(m, a.unitId);
      await this.notify.send(m, to, actor.id, `ACTIVITY_${step.action}`, step.message(a), 'activity', a.id);
      return { from, to: a.status, note };
    });
    await this.audit.log(actor, `ACTIVITY_${step.action}`, 'activity', id, {
      before: { status: STATUS_LABEL[summary.from] }, after: { status: STATUS_LABEL[summary.to] }, reason: summary.note ?? undefined,
    });
    return this.activities.get(actor, id);
  }
}

