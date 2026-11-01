// Ho so hoat dong: danh sach theo pham vi, them / sua (co lich su phien ban), xoa, gan buoi diem danh,
// dong thoi gian, binh luan, checklist danh gia - dac ta quan-ly-hoat-dong 3, 4.
// Quy trinh duyet / tra lai / danh gia nam o activity-workflow.service.ts.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Brackets, DataSource, EntityManager, In } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Page } from '../common/dto/pagination.dto';
import { appError, Err } from '../common/errors';
import { escapeLike } from '../common/sql';
import { UnitScopeService } from '../common/unit-scope.service';
import { Event } from '../events/entities/event.entity';
import { Unit } from '../units/entities/unit.entity';
import { AdminUser } from '../users/entities/admin-user.entity';
import { canEditStatus, checkLinkSet, cleanUrl, diffSnapshots, formatCode } from './activity-rules';
import {
  ActivityDto, ActivityListQuery, CommentDto, CreateActivityDto, DtoExtras, toActivityDto, UpdateActivityDto,
} from './dto/activity.dto';
import { AcademicYear } from './entities/academic-year.entity';
import { ActivityCategory } from './entities/activity-category.entity';
import { Activity } from './entities/activity.entity';
import {
  ActivityCoUnit, ActivityEvent, ActivityLink, ActivityVersion, Comment, WorkflowAction,
} from './entities/activity-parts.entity';
import { NotificationsService } from './notifications.service';

const VN_OFFSET = 7 * 3600_000;
const vnDay = (d: Date) => new Date(d.getTime() + VN_OFFSET).toISOString().slice(0, 10);

type Need = 'view' | 'manage';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scope: UnitScopeService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  // ---------------- doc ----------------

  async list(actor: CurrentUser, q: ActivityListQuery): Promise<Page<ActivityDto>> {
    const ids = await this.scope.visibleUnitIds(actor);
    const qb = this.ds.getRepository(Activity).createQueryBuilder('a')
      .leftJoinAndSelect('a.unit', 'u').leftJoinAndSelect('a.category', 'c').leftJoinAndSelect('a.academicYear', 'y');
    // [BM] thay hoat dong cua don vi minh (va cap duoi) hoac hoat dong minh la don vi phoi hop
    if (ids) {
      qb.andWhere(new Brackets((w) =>
        w.where('a.unitId IN (:...ids)', { ids })
          .orWhere('EXISTS (SELECT 1 FROM activity_co_units cu WHERE cu.activity_id = a.id AND cu.unit_id IN (:...ids))', { ids })));
    }
    if (q.academicYearId) qb.andWhere('a.academicYearId = :y', { y: q.academicYearId });
    if (q.unitId) qb.andWhere('a.unitId IN (:...tree)', { tree: await this.withDescendants(q.unitId) });
    if (q.categoryId) qb.andWhere('a.categoryId = :c', { c: q.categoryId });
    if (q.status) qb.andWhere('a.status = :s', { s: q.status });
    if (q.evaluation === 'NONE') qb.andWhere('a.evaluation IS NULL');
    else if (q.evaluation) qb.andWhere('a.evaluation = :ev', { ev: q.evaluation });
    if (q.reward === 'NONE') qb.andWhere('a.reward IS NULL');
    else if (q.reward) qb.andWhere('a.reward = :rw', { rw: q.reward });
    // collation utf8mb4 *_ci: LIKE khong phan biet hoa thuong va dau tieng Viet - dac ta 3.3
    // chu "đ" khong tu coi nhu "d" trong collation *_ci nen quy ve "d" o ca hai ve
    if (q.q) {
      qb.andWhere("(a.code LIKE :q OR REPLACE(REPLACE(a.name, 'đ', 'd'), 'Đ', 'D') LIKE :q)", {
        q: `%${escapeLike(q.q.replace(/đ/g, 'd').replace(/Đ/g, 'D'))}%`,
      });
    }
    if (q.from) qb.andWhere('a.startAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('a.startAt <= :to', { to: q.to });
    if (q.missingMedia) qb.andWhere("NOT EXISTS (SELECT 1 FROM activity_links l WHERE l.activity_id = a.id AND l.`group` = 'MEDIA')");

    const [rows, total] = await qb.orderBy('a.startAt', 'DESC').addOrderBy('a.id', 'ASC')
      .skip((q.page - 1) * q.limit).take(q.limit).getManyAndCount();
    return { items: await this.toDtos(actor, rows, false), total, page: q.page, limit: q.limit };
  }

  async get(actor: CurrentUser, id: string): Promise<ActivityDto> {
    const a = await this.ds.transaction((m) => this.load(m, actor, id, 'view').then((r) => r.activity));
    const full = await this.ds.getRepository(Activity).findOneOrFail({ where: { id: a.id }, relations: ['unit', 'category', 'academicYear'] });
    return (await this.toDtos(actor, [full], true))[0];
  }

  async timeline(actor: CurrentUser, id: string) {
    await this.ds.transaction((m) => this.load(m, actor, id, 'view'));
    const [flows, versions] = await Promise.all([
      this.ds.getRepository(WorkflowAction).find({ where: { entityType: 'activity', entityId: id } }),
      this.ds.getRepository(ActivityVersion).find({ where: { activityId: id } }),
    ]);
    const actorIds = [...new Set([...flows.map((f) => f.actorId), ...versions.map((v) => v.changedBy)])];
    const names = await this.nameMap(actorIds);
    const items = [
      ...flows.map((f) => ({ kind: 'WORKFLOW' as const, at: f.createdAt, actor: names.get(f.actorId) ?? null, action: f.action, note: f.note, version: null as number | null, diff: null })),
      // chi cac lan sua tay (UPDATE) co diff moi dang ke; buoc quy trinh da co dong WORKFLOW rieng nen khong lap lai
      ...versions.filter((v) => v.action === 'UPDATE' && v.diffJson && Object.keys(v.diffJson).length > 0)
        .map((v) => ({ kind: 'VERSION' as const, at: v.changedAt, actor: names.get(v.changedBy) ?? null, action: v.action, note: null, version: v.version, diff: v.diffJson })),
    ].sort((x, y) => x.at.getTime() - y.at.getTime());
    return { items };
  }

  // so sanh hai phien ban tuy y - dac ta 4.2
  async versions(actor: CurrentUser, id: string) {
    await this.ds.transaction((m) => this.load(m, actor, id, 'view'));
    const rows = await this.ds.getRepository(ActivityVersion).find({ where: { activityId: id }, order: { version: 'ASC' } });
    const names = await this.nameMap(rows.map((r) => r.changedBy));
    return { items: rows.map((r) => ({ version: r.version, action: r.action, at: r.changedAt, actor: names.get(r.changedBy) ?? null, snapshot: r.snapshotJson, diff: r.diffJson })) };
  }

  // [NV] 4.1: checklist tieu chi; chi gom muc do duoc tu du lieu, cac muc con lai nguoi danh gia tu xac nhan; chi GOI Y
  async checklist(actor: CurrentUser, id: string) {
    const { activity: a } = await this.ds.transaction((m) => this.load(m, actor, id, 'view'));
    const x = await this.extras([a.id]);
    const c = x.counts.get(a.id) ?? { media: 0, publication: 0, result: 0 };
    const att = x.attendance.get(a.id);
    const actual = att !== undefined ? att : a.manualCount;
    const approvedPlan = !!a.planUrl && ['IN_PROGRESS', 'PENDING_EVAL', 'EVALUATED', 'LOCKED'].includes(a.status);
    const criteria = [
      { key: 'PLAN', label: 'Có kế hoạch được duyệt', auto: true, passed: approvedPlan },
      { key: 'MEDIA', label: 'Có ít nhất 1 sản phẩm truyền thông', auto: true, passed: c.media >= 1 },
      { key: 'RESULT', label: 'Có báo cáo kết quả', auto: true, passed: c.result >= 1 },
      { key: 'ATTENDANCE', label: 'Đạt từ 70% số người dự kiến', auto: true,
        passed: a.expectedCount && a.expectedCount > 0 && actual !== null ? actual >= a.expectedCount * 0.7 : null },
      { key: 'TIMING', label: 'Tổ chức đúng thời gian đã duyệt', auto: false, passed: null as boolean | null },
      { key: 'CONTENT', label: 'Nội dung đúng kế hoạch', auto: false, passed: null as boolean | null },
    ];
    // goi y "Hoan thanh" khi moi muc do duoc deu dat; muc khong du du lieu (null) khong lam hong goi y
    const suggestion = criteria.filter((k) => k.auto).every((k) => k.passed !== false) ? 'COMPLETED' : 'NOT_COMPLETED';
    return { criteria, suggestion };
  }

  async comments(actor: CurrentUser, id: string) {
    await this.ds.transaction((m) => this.load(m, actor, id, 'view'));
    const rows = await this.ds.getRepository(Comment).find({ where: { entityType: 'activity', entityId: id }, order: { createdAt: 'ASC' } });
    const names = await this.nameMap(rows.map((r) => r.authorId));
    return { items: rows.map((r) => ({ id: r.id, author: names.get(r.authorId) ?? null, content: r.content, createdAt: r.createdAt })) };
  }

  // ---------------- ghi ----------------

  async create(actor: CurrentUser, dto: CreateActivityDto): Promise<ActivityDto> {
    const id = await this.ds.transaction(async (m) => {
      const year = await m.findOne(AcademicYear, { where: { id: dto.academicYearId } });
      if (!year) throw Err.bad('YEAR_INVALID', 'Năm học không tồn tại.');
      this.assertYearOpen(year);

      // [BM] quan ly khoa chi tao cho don vi minh (va cap duoi)
      const unitId = dto.unitId ?? actor.unitId;
      await this.scope.assertCanAccessUnit(actor, unitId);
      const unit = await m.findOne(Unit, { where: { id: unitId } });
      if (!unit || !unit.isActive) throw Err.bad('UNIT_INVALID', 'Đơn vị không tồn tại hoặc đã ngừng hoạt động.');

      this.assertSchedule(year, dto.startAt, dto.endAt);
      await this.assertCategory(m, dto.categoryId);
      const coUnitIds = await this.checkCoUnits(m, dto.coUnitIds ?? [], unitId);
      const links = checkLinkSet(dto.links ?? []);
      const planUrl = dto.planUrl ? cleanUrl(dto.planUrl).url : null;

      const code = await this.nextCode(m, new Date(dto.startAt.getTime() + VN_OFFSET).getUTCFullYear());
      const a = m.create(Activity, {
        id: randomUUID(), code, academicYearId: year.id, unitId, categoryId: dto.categoryId ?? null,
        level: dto.level ?? (unit.type === 'SCHOOL' ? 'SCHOOL' : 'FACULTY'), name: dto.name, startAt: dto.startAt, endAt: dto.endAt,
        location: dto.location ?? null, mode: dto.mode ?? 'ONSITE', targetAudience: dto.targetAudience ?? null,
        expectedCount: dto.expectedCount ?? null, manualCount: dto.manualCount ?? null,
        budgetPlanned: dto.budgetPlanned === undefined ? null : String(dto.budgetPlanned),
        budgetActual: dto.budgetActual === undefined ? null : String(dto.budgetActual),
        ownerName: dto.ownerName ?? null, ownerPhone: dto.ownerPhone ?? null, planUrl, note: dto.note ?? null,
        status: 'DRAFT', returnNote: null, returnedAt: null, submittedAt: null,
        evaluation: null, evaluationNote: null, evaluatedBy: null, evaluatedAt: null, reward: null, rewardNote: null, lockedAt: null,
        createdBy: actor.id,
      });
      await m.save(a);
      await this.saveLinks(m, a.id, links);
      if (coUnitIds.length) await m.save(coUnitIds.map((u) => m.create(ActivityCoUnit, { activityId: a.id, unitId: u })));
      await this.recordVersion(m, a, 'CREATE', actor.id, null);
      return a.id;
    });
    const created = await this.ds.getRepository(Activity).findOneOrFail({ where: { id } });
    await this.audit.log(actor, 'ACTIVITY_CREATE', 'activity', id, { after: { code: created.code, name: created.name, unitId: created.unitId } });
    return this.get(actor, id);
  }

  async update(actor: CurrentUser, id: string, dto: UpdateActivityDto): Promise<ActivityDto> {
    const changed = await this.ds.transaction(async (m) => {
      const { activity: a } = await this.load(m, actor, id, 'manage', true);
      const year = await m.findOneOrFail(AcademicYear, { where: { id: a.academicYearId } });
      this.assertYearOpen(year);
      if (!canEditStatus(a.status, actor.role === 'SCHOOL_ADMIN')) {
        throw Err.conflict('NOT_EDITABLE', 'Hồ sơ đang ở trạng thái không sửa được. Chờ kết quả duyệt hoặc nhờ Đoàn trường trả lại.');
      }
      const before = await this.snapshotOf(m, a);

      if (dto.name !== undefined) a.name = dto.name;
      if (dto.level !== undefined) a.level = dto.level;
      if (dto.startAt !== undefined) a.startAt = dto.startAt;
      if (dto.endAt !== undefined) a.endAt = dto.endAt;
      if (dto.startAt !== undefined || dto.endAt !== undefined) this.assertSchedule(year, a.startAt, a.endAt);
      if (dto.categoryId !== undefined) { await this.assertCategory(m, dto.categoryId ?? undefined); a.categoryId = dto.categoryId; }
      if (dto.location !== undefined) a.location = dto.location;
      if (dto.mode !== undefined) a.mode = dto.mode;
      if (dto.targetAudience !== undefined) a.targetAudience = dto.targetAudience;
      if (dto.expectedCount !== undefined) a.expectedCount = dto.expectedCount;
      if (dto.manualCount !== undefined) a.manualCount = dto.manualCount;
      if (dto.budgetPlanned !== undefined) a.budgetPlanned = dto.budgetPlanned === null ? null : String(dto.budgetPlanned);
      if (dto.budgetActual !== undefined) a.budgetActual = dto.budgetActual === null ? null : String(dto.budgetActual);
      if (dto.ownerName !== undefined) a.ownerName = dto.ownerName;
      if (dto.ownerPhone !== undefined) a.ownerPhone = dto.ownerPhone;
      if (dto.planUrl !== undefined) a.planUrl = dto.planUrl === null ? null : cleanUrl(dto.planUrl).url;
      if (dto.note !== undefined) a.note = dto.note;
      await m.save(a);

      if (dto.links !== undefined) {
        const links = checkLinkSet(dto.links);
        await m.delete(ActivityLink, { activityId: a.id });
        await this.saveLinks(m, a.id, links);
      }
      if (dto.coUnitIds !== undefined) {
        const ids = await this.checkCoUnits(m, dto.coUnitIds, a.unitId);
        await m.delete(ActivityCoUnit, { activityId: a.id });
        if (ids.length) await m.save(ids.map((u) => m.create(ActivityCoUnit, { activityId: a.id, unitId: u })));
      }

      const diff = diffSnapshots(before, await this.snapshotOf(m, a));
      if (Object.keys(diff).length === 0) return null; // khong doi gi: khong tao phien ban
      await this.recordVersion(m, a, 'UPDATE', actor.id, before);
      return diff;
    });
    if (changed) await this.audit.log(actor, 'ACTIVITY_UPDATE', 'activity', id, { after: { fields: Object.keys(changed) } });
    return this.get(actor, id);
  }

  // xoa cung chi khi con la ban nhap; da qua duyet thi giu lai de doi chieu - dac ta 3.7
  async remove(actor: CurrentUser, id: string, reason: string): Promise<void> {
    const info = await this.ds.transaction(async (m) => {
      const { activity: a } = await this.load(m, actor, id, 'manage', true);
      const year = await m.findOneOrFail(AcademicYear, { where: { id: a.academicYearId } });
      this.assertYearOpen(year);
      if (a.status !== 'DRAFT') throw Err.conflict('NOT_DELETABLE', 'Chỉ xóa được hồ sơ còn ở trạng thái Nháp.');
      await m.delete(Activity, { id });
      return { code: a.code, name: a.name, unitId: a.unitId };
    });
    await this.audit.log(actor, 'ACTIVITY_DELETE', 'activity', id, { before: info, reason });
  }

  async addComment(actor: CurrentUser, id: string, dto: CommentDto) {
    const row = await this.ds.transaction(async (m) => {
      const { activity: a, manage } = await this.load(m, actor, id, 'view');
      // don vi phoi hop chi xem, khong binh luan
      if (!manage) throw appError(403, 'READ_ONLY_ACTIVITY', 'Bạn chỉ được xem hồ sơ này.');
      const c = await m.save(m.create(Comment, { id: randomUUID(), entityType: 'activity', entityId: id, authorId: actor.id, content: dto.content, createdAt: new Date() }));
      // phia ben kia nhan thong bao: khoa binh luan -> Doan truong; Doan truong binh luan -> quan ly khoa
      const to = actor.role === 'SCHOOL_ADMIN' ? await this.notify.unitManagers(m, a.unitId) : await this.notify.admins(m);
      await this.notify.send(m, to, actor.id, 'ACTIVITY_COMMENT', `Bình luận mới ở hồ sơ ${a.code}: ${a.name}`, 'activity', id);
      return c;
    });
    return { id: row.id, content: row.content, createdAt: row.createdAt };
  }

  async linkEvent(actor: CurrentUser, id: string, eventId: string): Promise<ActivityDto> {
    await this.ds.transaction(async (m) => {
      const { activity: a } = await this.load(m, actor, id, 'manage', true);
      await this.assertOpenAndEditable(m, a, actor);
      const ev = await m.findOne(Event, { where: { id: eventId } });
      // [BM] chi gan duoc su kien thuoc don vi trong pham vi quan ly cua minh
      const ids = await this.scope.visibleUnitIds(actor);
      if (!ev || (ids !== null && !ids.includes(ev.unitId))) throw Err.notFound('sự kiện');
      if (await m.exists(ActivityEvent, { where: { activityId: id, eventId } })) throw Err.conflict('ALREADY_LINKED', 'Sự kiện đã được gắn vào hoạt động này.');
      await m.save(m.create(ActivityEvent, { activityId: id, eventId }));
    });
    await this.audit.log(actor, 'ACTIVITY_EVENT_LINK', 'activity', id, { after: { eventId } });
    return this.get(actor, id);
  }

  async unlinkEvent(actor: CurrentUser, id: string, eventId: string): Promise<ActivityDto> {
    await this.ds.transaction(async (m) => {
      const { activity: a } = await this.load(m, actor, id, 'manage', true);
      await this.assertOpenAndEditable(m, a, actor);
      const r = await m.delete(ActivityEvent, { activityId: id, eventId });
      if (!r.affected) throw Err.notFound('liên kết sự kiện');
    });
    await this.audit.log(actor, 'ACTIVITY_EVENT_UNLINK', 'activity', id, { before: { eventId } });
    return this.get(actor, id);
  }

  // ---------------- dung chung cho workflow ----------------

  // Nap hoat dong + kiem tra quyen. [BM] ngoai pham vi -> 404 (khong lo su ton tai); chi xem ma doi sua -> 403.
  async load(m: EntityManager, actor: CurrentUser, id: string, need: Need, lock = false): Promise<{ activity: Activity; manage: boolean }> {
    const a = await m.findOne(Activity, { where: { id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!a) throw Err.notFound('hồ sơ hoạt động');
    const ids = await this.scope.visibleUnitIds(actor);
    const manage = ids === null || ids.includes(a.unitId);
    if (!manage) {
      const co = await m.count(ActivityCoUnit, { where: { activityId: id, unitId: In(ids!) } });
      if (co === 0) throw Err.notFound('hồ sơ hoạt động');
      if (need === 'manage') throw appError(403, 'READ_ONLY_ACTIVITY', 'Bạn chỉ được xem hồ sơ này (đơn vị phối hợp).');
    }
    return { activity: a, manage };
  }

  assertYearOpen(y: AcademicYear): void {
    if (y.lockedAt) throw Err.conflict('YEAR_LOCKED', `Năm học ${y.name} đã khóa sổ, dữ liệu chỉ đọc.`);
  }

  async snapshotOf(m: EntityManager, a: Activity): Promise<Record<string, unknown>> {
    const [links, co] = await Promise.all([m.find(ActivityLink, { where: { activityId: a.id } }), m.find(ActivityCoUnit, { where: { activityId: a.id } })]);
    const n = (v: string | null) => (v === null ? null : Number(v));
    return {
      name: a.name, categoryId: a.categoryId, level: a.level, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(),
      location: a.location, mode: a.mode, targetAudience: a.targetAudience, expectedCount: a.expectedCount, manualCount: a.manualCount,
      budgetPlanned: n(a.budgetPlanned), budgetActual: n(a.budgetActual), ownerName: a.ownerName, ownerPhone: a.ownerPhone,
      planUrl: a.planUrl, note: a.note, status: a.status, evaluation: a.evaluation, evaluationNote: a.evaluationNote,
      reward: a.reward, rewardNote: a.rewardNote,
      links: links.map((l) => `${l.group}|${l.type}|${l.url}|${l.publishedOn ?? ''}`).sort(),
      coUnitIds: co.map((c) => c.unitId).sort(),
    };
  }

  // ghi mot dong lich su; before = null khi tao moi
  async recordVersion(m: EntityManager, a: Activity, action: string, actorId: string, before: Record<string, unknown> | null): Promise<void> {
    const after = await this.snapshotOf(m, a);
    const row = await m.createQueryBuilder(ActivityVersion, 'v').select('COALESCE(MAX(v.version), 0)', 'n').where('v.activityId = :id', { id: a.id }).getRawOne<{ n: string }>();
    await m.save(m.create(ActivityVersion, {
      id: randomUUID(), activityId: a.id, version: Number(row?.n ?? 0) + 1, action, changedBy: actorId, changedAt: new Date(),
      diffJson: before ? diffSnapshots(before, after) : null, snapshotJson: after,
    }));
  }

  // ---------------- noi bo ----------------

  private async assertOpenAndEditable(m: EntityManager, a: Activity, actor: CurrentUser): Promise<void> {
    const year = await m.findOneOrFail(AcademicYear, { where: { id: a.academicYearId } });
    this.assertYearOpen(year);
    if (!canEditStatus(a.status, actor.role === 'SCHOOL_ADMIN')) throw Err.conflict('NOT_EDITABLE', 'Hồ sơ đang ở trạng thái không sửa được.');
  }

  // [NV] ngay bat dau phai nam trong nam hoc, ket thuc sau bat dau
  private assertSchedule(year: AcademicYear, startAt: Date, endAt: Date): void {
    if (!(startAt < endAt)) throw Err.bad('INVALID_SCHEDULE', 'Thời gian kết thúc phải sau thời gian bắt đầu.');
    const day = vnDay(startAt);
    if (day < year.startDate || day > year.endDate) {
      throw Err.bad('OUT_OF_YEAR', `Ngày bắt đầu phải nằm trong năm học ${year.name} (${year.startDate} đến ${year.endDate}).`);
    }
  }

  private async assertCategory(m: EntityManager, categoryId?: string): Promise<void> {
    if (!categoryId) return;
    const c = await m.findOne(ActivityCategory, { where: { id: categoryId } });
    if (!c || !c.isActive) throw Err.bad('CATEGORY_INVALID', 'Lĩnh vực không tồn tại hoặc đã ngừng dùng.');
  }

  private async checkCoUnits(m: EntityManager, ids: string[], ownerUnitId: string): Promise<string[]> {
    const list = ids.filter((u) => u !== ownerUnitId);
    if (list.length === 0) return [];
    const found = await m.find(Unit, { where: { id: In(list) } });
    if (found.length !== list.length || found.some((u) => !u.isActive)) throw Err.bad('UNIT_INVALID', 'Có đơn vị phối hợp không tồn tại hoặc đã ngừng hoạt động.');
    return list;
  }

  private async saveLinks(m: EntityManager, activityId: string, links: ReturnType<typeof checkLinkSet<{ group: ActivityLink['group']; type?: ActivityLink['type']; url: string; publishedOn?: string }>>): Promise<void> {
    const position: Record<string, number> = {};
    if (links.length === 0) return;
    await m.save(links.map((l) => {
      position[l.group] = (position[l.group] ?? 0) + 1;
      return m.create(ActivityLink, {
        id: randomUUID(), activityId, group: l.group, type: l.type ?? 'OTHER', url: l.url, urlHash: l.urlHash,
        publishedOn: l.publishedOn ?? null, position: position[l.group], needsReview: l.needsReview,
      });
    }));
  }

  // Cap ma: UPDATE ... LAST_INSERT_ID(x + 1) khoa dong theo nam va tang nguyen tu, khong trung, khong nhay so
  private async nextCode(m: EntityManager, year: number): Promise<string> {
    // [NV] ma hoat dong: mot cau lenh nguyen tu de tranh deadlock khi nhieu nguoi tao cung luc (INSERT IGNORE + UPDATE tach roi gay deadlock)
    await m.query(
      'INSERT INTO activity_code_sequences (year, last_value) VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)',
      [year],
    );
    const [row] = await m.query('SELECT LAST_INSERT_ID() AS n');
    return formatCode(year, Number(row.n));
  }

  private async withDescendants(unitId: string): Promise<string[]> {
    const out = [unitId];
    let frontier = [unitId];
    for (let depth = 0; depth < 5 && frontier.length; depth++) {
      const kids = await this.ds.getRepository(Unit).find({ where: { parentId: In(frontier) }, select: ['id'] });
      frontier = kids.map((k) => k.id).filter((k) => !out.includes(k));
      out.push(...frontier);
    }
    return out;
  }

  private async nameMap(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.ds.getRepository(AdminUser).find({ where: { id: In([...new Set(ids)]) }, select: ['id', 'fullName'] });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  // so lieu phu cho mot loat hoat dong: dem link, so nguoi tu diem danh, don vi phoi hop (3 truy van, khong N+1)
  private async extras(ids: string[]) {
    const counts = new Map<string, { media: number; publication: number; result: number }>();
    const attendance = new Map<string, number>();
    const coUnits = new Map<string, Array<{ id: string; name: string }>>();
    if (ids.length === 0) return { counts, attendance, coUnits };
    const [links, att, cos] = await Promise.all([
      this.ds.query('SELECT activity_id AS id, `group` AS g, COUNT(*) AS n FROM activity_links WHERE activity_id IN (?) GROUP BY activity_id, `group`', [ids]),
      // chi co dong khi hoat dong co it nhat mot buoi diem danh gan kem; n = so MSSV khac nhau (khong tinh luot da huy)
      this.ds.query('SELECT ae.activity_id AS id, COUNT(DISTINCT a.mssv) AS n FROM activity_events ae LEFT JOIN attendances a ON a.event_id = ae.event_id AND a.voided_at IS NULL WHERE ae.activity_id IN (?) GROUP BY ae.activity_id', [ids]),
      this.ds.query('SELECT cu.activity_id AS id, u.id AS uid, u.name AS name FROM activity_co_units cu JOIN units u ON u.id = cu.unit_id WHERE cu.activity_id IN (?) ORDER BY u.name', [ids]),
    ]);
    for (const r of links) {
      const c = counts.get(r.id) ?? { media: 0, publication: 0, result: 0 };
      c[String(r.g).toLowerCase() as 'media' | 'publication' | 'result'] = Number(r.n);
      counts.set(r.id, c);
    }
    for (const r of att) attendance.set(r.id, Number(r.n));
    for (const r of cos) coUnits.set(r.id, [...(coUnits.get(r.id) ?? []), { id: r.uid, name: r.name }]);
    return { counts, attendance, coUnits };
  }

  private async toDtos(actor: CurrentUser, rows: Activity[], detail: boolean): Promise<ActivityDto[]> {
    const ids = await this.scope.visibleUnitIds(actor);
    const isAdmin = actor.role === 'SCHOOL_ADMIN';
    const x = await this.extras(rows.map((r) => r.id));
    return Promise.all(rows.map(async (a) => {
      const manage = ids === null || ids.includes(a.unitId);
      const locked = a.academicYear?.lockedAt != null;
      const extra: DtoExtras = {
        counts: x.counts.get(a.id) ?? { media: 0, publication: 0, result: 0 },
        attendance: x.attendance.has(a.id) ? x.attendance.get(a.id)! : null,
        coUnits: x.coUnits.get(a.id) ?? [],
        canEdit: manage && !locked && canEditStatus(a.status, isAdmin),
        canSubmit: manage && !locked && (a.status === 'DRAFT' || a.status === 'IN_PROGRESS'),
        canReview: isAdmin && !locked,
      };
      if (detail) {
        extra.links = await this.ds.getRepository(ActivityLink).find({ where: { activityId: a.id }, order: { group: 'ASC', position: 'ASC' } });
        const evs = await this.ds.query(
          'SELECT e.id, e.title, e.start_at AS startAt, (SELECT COUNT(DISTINCT t.mssv) FROM attendances t WHERE t.event_id = e.id AND t.voided_at IS NULL) AS n FROM activity_events ae JOIN events e ON e.id = ae.event_id WHERE ae.activity_id = ? ORDER BY e.start_at',
          [a.id]);
        extra.events = evs.map((e: { id: string; title: string; startAt: Date; n: string }) => ({ id: e.id, title: e.title, startAt: e.startAt, attendanceCount: Number(e.n) }));
      }
      return toActivityDto(a, extra);
    }));
  }
}
