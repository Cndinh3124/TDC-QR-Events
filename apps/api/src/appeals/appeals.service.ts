// Xu ly khieu nai trong trang quan tri - dac ta 2.3, 3.5, 3.6
// Don vi to chuc su kien xu ly; Doan truong toan quyen. Khieu nai con han duoc sua ca su kien da chot.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AttendancesService } from '../attendances/attendances.service';
import { ReviewService } from '../attendances/review.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Page } from '../common/dto/pagination.dto';
import { Err } from '../common/errors';
import { UnitScopeService } from '../common/unit-scope.service';
import { Event } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { Attendance } from '../public/entities/attendance.entity';
import { Appeal } from './appeal.entity';
import { AppealDto, AppealListQuery, HandleAppealDto, toAppealDto } from './appeals.dto';

@Injectable()
export class AppealsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventsService,
    private readonly attendances: AttendancesService,
    private readonly review: ReviewService,
    private readonly scope: UnitScopeService,
    private readonly audit: AuditService,
  ) {}

  // [BM] chi khieu nai cua su kien thuoc don vi trong pham vi (manage); cho xu ly truoc, gan han truoc
  async list(actor: CurrentUser, q: AppealListQuery): Promise<Page<AppealDto>> {
    const ids = await this.scope.visibleUnitIds(actor);
    const qb = this.ds.getRepository(Appeal).createQueryBuilder('a').innerJoinAndMapOne('a.event', Event, 'e', 'e.id = a.eventId');
    if (ids) qb.andWhere('e.unitId IN (:...ids)', { ids });
    if (q.status) qb.andWhere('a.status = :status', { status: q.status });
    if (q.eventId) qb.andWhere('a.eventId = :eventId', { eventId: q.eventId });
    // join 1-1 nen dung limit / offset (khong phai skip / take) de duoc sap xep theo bieu thuc
    const total = await qb.getCount();
    const rows = await qb
      .addSelect("(a.status = 'PENDING')", 'is_pending')
      .orderBy('is_pending', 'DESC').addOrderBy('a.deadlineAt', 'ASC').addOrderBy('a.createdAt', 'DESC')
      .limit(q.limit).offset((q.page - 1) * q.limit)
      .getMany();
    const items = rows.map((r) => toAppealDto(r, { id: (r as any).event.id, title: (r as any).event.title }));
    return { items, total, page: q.page, limit: q.limit };
  }

  async handle(actor: CurrentUser, id: string, dto: HandleAppealDto): Promise<AppealDto> {
    if (dto.action === 'REJECT' && (dto.approveAttendance || dto.attendance)) {
      throw Err.bad('INVALID_ACTION', 'Từ chối khiếu nại thì không kèm thay đổi lượt điểm danh.');
    }
    const { before, after, event } = await this.ds.transaction(async (m) => {
      const peek = await m.findOne(Appeal, { where: { id }, select: ['id', 'eventId'] });
      if (!peek) throw Err.notFound('khiếu nại');
      // khoa su kien truoc, roi khoa khieu nai (cung thu tu voi thao tac khac)
      const e = await this.events.lockScoped(m, actor, peek.eventId);
      const a = await m.findOneOrFail(Appeal, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (a.status !== 'PENDING') throw Err.conflict('ALREADY_HANDLED', 'Khiếu nại này đã được xử lý.');
      if (e.archivedAt || e.status === 'CANCELLED') throw Err.conflict('INVALID_STATE', 'Sự kiện đã hủy hoặc lưu trữ, không xử lý khiếu nại được.');

      const before = { status: a.status, attendanceId: a.attendanceId };
      if (dto.action === 'ACCEPT') await this.applyAccept(m, actor, e, a, dto);
      a.status = dto.action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
      a.handledBy = actor.id;
      a.handledAt = new Date();
      a.resolutionNote = dto.note;
      await m.save(a);
      return { before, after: { status: a.status, attendanceId: a.attendanceId }, event: e };
    });
    await this.audit.log(actor, dto.action === 'ACCEPT' ? 'APPEAL_ACCEPT' : 'APPEAL_REJECT', 'appeal', id, {
      before, after, reason: dto.note,
    });
    return toAppealDto(await this.ds.getRepository(Appeal).findOneByOrFail({ id }), { id: event.id, title: event.title });
  }

  // Chap nhan: tao luot moi hoac duyet luot co san; su kien da chot thi tinh DRL ngay cho luot do.
  private async applyAccept(m: import('typeorm').EntityManager, actor: CurrentUser, e: Event, a: Appeal, dto: HandleAppealDto) {
    if (dto.attendance && dto.approveAttendance) {
      throw Err.bad('INVALID_ACTION', 'Chọn một trong hai: tạo lượt mới hoặc duyệt lượt có sẵn.');
    }
    this.attendances.assertMutable(e, true);
    let attendanceId = a.attendanceId;
    if (dto.attendance) {
      if (a.attendanceId) throw Err.bad('INVALID_ACTION', 'Khiếu nại này đã gắn với một lượt điểm danh, hãy duyệt lượt đó.');
      const created = await this.attendances.createManualIn(m, actor, e, dto.attendance, `Khiếu nại được chấp nhận: ${dto.note}`.slice(0, 500));
      attendanceId = created.id;
      a.attendanceId = created.id;
    } else if (dto.approveAttendance) {
      if (!a.attendanceId) throw Err.bad('NO_ATTENDANCE', 'Khiếu nại chưa gắn với lượt điểm danh nào để duyệt.');
      const att = await m.findOneOrFail(Attendance, { where: { id: a.attendanceId }, lock: { mode: 'pessimistic_write' } });
      if (att.voidedAt) {
        att.voidedAt = null;
        att.voidReason = null;
      }
      this.attendances.applyReview(att, 'APPROVED', `Khiếu nại được chấp nhận: ${dto.note}`.slice(0, 500), actor.id);
      await m.save(att);
    }
    if (attendanceId && e.status === 'FINALIZED') await this.review.awardOne(m, e, attendanceId);
  }
}
