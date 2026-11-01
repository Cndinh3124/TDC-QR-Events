// Duyet va quan ly luot diem danh trong trang quan tri - dac ta 3.6, 3.7, 5.3
// Luong moi thao tac: kiem tra quyen + pham vi -> kiem tra trang thai -> xu ly -> ghi lich su + nhat ky.
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Page } from '../common/dto/pagination.dto';
import { Err } from '../common/errors';
import { escapeLike } from '../common/sql';
import { UnitScopeService } from '../common/unit-scope.service';
import { Event } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { newConfirmCode } from '../public/checkin.service';
import { Attendance } from '../public/entities/attendance.entity';
import { AttendanceEdit } from '../public/entities/attendance-edit.entity';
import { AttendanceFlag } from '../public/entities/attendance-flag.entity';
import { PublicLookupService } from '../public/public-lookup.service';
import {
  AttendanceDto, AttendanceListQuery, attendanceAuditView, BulkDto, EditAttendanceAdminDto, ManualAttendanceDto,
  ManualFieldsDto, ReviewDto, toAttendanceDto,
} from './dto/attendance.dto';
import { ReviewService } from './review.service';

export interface AttendanceSummary {
  total: number; // khong tinh luot da huy
  pending: number;
  approved: number;
  rejected: number;
  voided: number;
  flagged: number;
  cleanPending: number; // cho duyet va khong co co: nhom "duyet hang loat"
  noCheckout: number;
}

@Injectable()
export class AttendancesService {
  constructor(
    @InjectRepository(Attendance) private readonly repo: Repository<Attendance>,
    @InjectRepository(Event) private readonly eventRepo: Repository<Event>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventsService,
    private readonly review: ReviewService,
    private readonly lookup: PublicLookupService,
    private readonly scope: UnitScopeService,
    private readonly audit: AuditService,
  ) {}

  // ---------- doc ----------

  async list(actor: CurrentUser, eventId: string, q: AttendanceListQuery): Promise<Page<AttendanceDto>> {
    const { access } = await this.readable(actor, eventId);
    const qb = this.repo.createQueryBuilder('a').leftJoinAndSelect('a.faculty', 'f').where('a.eventId = :eventId', { eventId });
    await this.limitToFaculties(actor, access, qb);
    if (q.review) qb.andWhere('a.reviewStatus = :review', { review: q.review });
    if (q.source) qb.andWhere('a.source = :source', { source: q.source });
    if (q.voided === 'exclude') qb.andWhere('a.voidedAt IS NULL');
    if (q.voided === 'only') qb.andWhere('a.voidedAt IS NOT NULL');
    const anyFlag = 'EXISTS (SELECT 1 FROM attendance_flags fl WHERE fl.attendance_id = a.id)';
    if (q.flagged === 'yes') qb.andWhere(anyFlag);
    if (q.flagged === 'no') qb.andWhere(`NOT ${anyFlag}`);
    if (q.flag) {
      qb.andWhere('EXISTS (SELECT 1 FROM attendance_flags fc WHERE fc.attendance_id = a.id AND fc.code = :flag)', { flag: q.flag });
    }
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`;
      qb.andWhere('(a.mssv LIKE :like OR a.fullName LIKE :like)', { like });
    }
    const [rows, total] = await qb
      .orderBy('a.checkinAt', 'ASC').addOrderBy('a.id', 'ASC')
      .skip((q.page - 1) * q.limit).take(q.limit)
      .getManyAndCount();
    const flags = await this.flagsOf(rows.map((r) => r.id));
    const items = rows.map((r) => toAttendanceDto(r, flags.get(r.id) ?? [], access === 'manage'));
    return { items, total, page: q.page, limit: q.limit };
  }

  async summary(actor: CurrentUser, eventId: string): Promise<AttendanceSummary> {
    const { access } = await this.readable(actor, eventId);
    const qb = this.repo.createQueryBuilder('a').where('a.eventId = :eventId', { eventId });
    await this.limitToFaculties(actor, access, qb);
    const anyFlag = 'EXISTS (SELECT 1 FROM attendance_flags fl WHERE fl.attendance_id = a.id)';
    const r = await qb
      .select('SUM(a.voidedAt IS NULL)', 'total')
      .addSelect("SUM(a.voidedAt IS NULL AND a.reviewStatus = 'PENDING')", 'pending')
      .addSelect("SUM(a.voidedAt IS NULL AND a.reviewStatus = 'APPROVED')", 'approved')
      .addSelect("SUM(a.voidedAt IS NULL AND a.reviewStatus = 'REJECTED')", 'rejected')
      .addSelect('SUM(a.voidedAt IS NOT NULL)', 'voided')
      .addSelect(`SUM(a.voidedAt IS NULL AND ${anyFlag})`, 'flagged')
      .addSelect(`SUM(a.voidedAt IS NULL AND a.reviewStatus = 'PENDING' AND NOT ${anyFlag})`, 'cleanPending')
      .addSelect("SUM(a.voidedAt IS NULL AND EXISTS (SELECT 1 FROM attendance_flags fn WHERE fn.attendance_id = a.id AND fn.code = 'NO_CHECKOUT'))", 'noCheckout')
      .getRawOne();
    const n = (v: unknown) => Number(v ?? 0);
    return {
      total: n(r.total), pending: n(r.pending), approved: n(r.approved), rejected: n(r.rejected),
      voided: n(r.voided), flagged: n(r.flagged), cleanPending: n(r.cleanPending), noCheckout: n(r.noCheckout),
    };
  }

  // ---------- duyet ----------

  async reviewOne(actor: CurrentUser, id: string, dto: ReviewDto): Promise<AttendanceDto> {
    if (dto.status === 'REJECTED' && !dto.reason) throw Err.bad('REASON_REQUIRED', 'Từ chối lượt điểm danh phải nhập lý do.');
    const { before, after, started, eventId } = await this.ds.transaction(async (m) => {
      const { a, e } = await this.lockPair(m, actor, id);
      this.assertMutable(e);
      if (a.voidedAt) throw Err.conflict('ATTENDANCE_VOIDED', 'Lượt này đã bị hủy, hãy khôi phục trước khi duyệt.');
      const started = await this.review.startIfNeeded(m, e);
      const before = attendanceAuditView(a);
      this.applyReview(a, dto.status, dto.reason, actor.id);
      await m.save(a);
      return { before, after: attendanceAuditView(a), started, eventId: e.id };
    });
    if (started) await this.audit.log(actor, 'EVENT_REVIEW_START', 'event', eventId, {});
    await this.audit.log(actor, 'ATTENDANCE_REVIEW', 'attendance', id, { before, after, reason: dto.reason });
    return this.one(actor, id);
  }

  // [NV] 3.7: duyet / tu choi / huy nhieu luot; APPROVE_CLEAN = duyet moi luot cho duyet va khong co co
  async bulk(actor: CurrentUser, dto: BulkDto): Promise<{ updated: number; skipped: number }> {
    const needsReason = dto.action === 'REJECT' || dto.action === 'VOID';
    if (needsReason && !dto.reason) throw Err.bad('REASON_REQUIRED', 'Từ chối hoặc hủy hàng loạt phải nhập lý do.');
    const { updated, started } = await this.ds.transaction(async (m) => {
      const e = await this.events.lockScoped(m, actor, dto.eventId);
      this.assertMutable(e);
      const started = dto.action === 'VOID' ? false : await this.review.startIfNeeded(m, e);
      return { updated: await this.runBulk(m, e.id, dto, actor.id), started };
    });
    const requested = dto.ids?.length ?? updated;
    if (started) await this.audit.log(actor, 'EVENT_REVIEW_START', 'event', dto.eventId, {});
    await this.audit.log(actor, 'ATTENDANCE_BULK', 'event', dto.eventId, {
      after: { action: dto.action, updated, ids: dto.ids },
      reason: dto.reason,
    });
    return { updated, skipped: Math.max(0, requested - updated) };
  }

  // ---------- them / sua / huy ----------

  // [NV] 3.7, 5.3: them luot thu cong (vd. sinh vien that bi chan GPS); co MANUAL_ENTRY de minh bach
  async createManual(actor: CurrentUser, eventId: string, dto: ManualAttendanceDto): Promise<AttendanceDto> {
    const id = await this.ds.transaction(async (m) => {
      const e = await this.events.lockScoped(m, actor, eventId);
      this.assertMutable(e);
      return (await this.createManualIn(m, actor, e, dto, dto.reason)).id;
    });
    await this.audit.log(actor, 'ATTENDANCE_MANUAL_CREATE', 'attendance', id, { reason: dto.reason, after: { eventId } });
    return this.one(actor, id);
  }

  // Phan ghi cua "them thu cong", chay trong giao dich cua noi goi (da khoa su kien). Xu ly khieu nai cung dung.
  async createManualIn(m: EntityManager, actor: CurrentUser, e: Event, dto: ManualFieldsDto, reason: string): Promise<Attendance> {
    const mssv = await this.lookup.validMssv(dto.mssv);
    await this.lookup.assertFaculty(dto.facultyUnitId);
    await this.assertMssvFree(m, e.id, mssv, null);
    const checkinAt = dto.checkinAt ?? e.startAt;
    this.assertTimes(e, checkinAt, dto.checkoutAt ?? null);
    const row = m.create(Attendance, {
      id: randomUUID(), eventId: e.id, deviceId: null, mssv, fullName: dto.fullName, email: dto.email ?? null,
      facultyUnitId: dto.facultyUnitId, checkinAt, checkoutAt: dto.checkoutAt ?? null,
      timeliness: this.timeliness(e, checkinAt), lat: null, lng: null, gpsAccuracyM: null, distanceM: null,
      ip: null, userAgent: null, editCount: 0, source: 'MANUAL', reviewStatus: 'APPROVED', reviewedBy: actor.id,
      reviewedAt: new Date(), reviewNote: reason, drlAwarded: null, confirmCode: newConfirmCode(), idempotencyKey: null,
      checkoutIdempotencyKey: null, codeFailCount: 0, codeLockedUntil: null, voidedAt: null, voidReason: null,
    });
    await m.insert(Attendance, row);
    await m.query("INSERT IGNORE INTO attendance_flags (attendance_id, code, detail_json) VALUES (?, 'MANUAL_ENTRY', NULL)", [row.id]);
    await this.ensureStudent(m, row);
    return row;
  }

  async editOne(actor: CurrentUser, id: string, dto: EditAttendanceAdminDto): Promise<AttendanceDto> {
    const { before, after } = await this.ds.transaction(async (m) => {
      const { a, e } = await this.lockPair(m, actor, id);
      this.assertMutable(e);
      const before = attendanceAuditView(a);
      await this.applyEdit(m, e, a, dto);
      const after = attendanceAuditView(a);
      if (JSON.stringify(before) === JSON.stringify(after)) throw Err.bad('NO_CHANGES', 'Không có thông tin nào thay đổi.');
      await m.save(a);
      await m.insert(AttendanceEdit, {
        attendanceId: id, oldJson: before as any, newJson: after as any, actorType: 'ADMIN', actorId: actor.id,
        reason: dto.reason, idempotencyKey: null,
      });
      await this.ensureStudent(m, a);
      return { before, after };
    });
    await this.audit.log(actor, 'ATTENDANCE_EDIT', 'attendance', id, { before, after, reason: dto.reason });
    return this.one(actor, id);
  }

  // [NV] 3.7: du lieu diem danh khong xoa cung: "huy" co ly do, khoi phuc duoc (quay ve cho duyet)
  async setVoided(actor: CurrentUser, id: string, reason: string, voided: boolean): Promise<AttendanceDto> {
    const { before, after } = await this.ds.transaction(async (m) => {
      const { a, e } = await this.lockPair(m, actor, id);
      this.assertMutable(e);
      if (voided && a.voidedAt) throw Err.conflict('ALREADY_VOIDED', 'Lượt này đã bị hủy.');
      if (!voided && !a.voidedAt) throw Err.conflict('NOT_VOIDED', 'Lượt này chưa bị hủy.');
      const before = attendanceAuditView(a);
      if (voided) {
        a.voidedAt = new Date();
        a.voidReason = reason;
      } else {
        a.voidedAt = null;
        a.voidReason = null;
        this.applyReview(a, 'PENDING', undefined, actor.id);
      }
      await m.save(a);
      return { before, after: attendanceAuditView(a) };
    });
    await this.audit.log(actor, voided ? 'ATTENDANCE_VOID' : 'ATTENDANCE_RESTORE', 'attendance', id, { before, after, reason });
    return this.one(actor, id);
  }

  // ---------- noi bo ----------

  // xem duoc su kien (manage hoac view); ngoai pham vi = 404
  private async readable(actor: CurrentUser, eventId: string): Promise<{ event: Event; access: 'manage' | 'view' }> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    const access = event ? await this.events.access(actor, event) : 'none';
    if (!event || access === 'none') throw Err.notFound('sự kiện');
    return { event, access };
  }

  // [NV] 2.4: nguoi chi-xem (khoa xem su kien cap truong) chi thay sinh vien thuoc pham vi khoa minh
  private async limitToFaculties(actor: CurrentUser, access: 'manage' | 'view', qb: { andWhere: (c: string, p?: object) => unknown }) {
    if (access === 'manage') return;
    const ids = (await this.scope.visibleUnitIds(actor)) ?? [];
    qb.andWhere('a.facultyUnitId IN (:...facultyIds)', { facultyIds: ids.length ? ids : [''] });
  }

  private async flagsOf(ids: string[]): Promise<Map<string, AttendanceFlag[]>> {
    const map = new Map<string, AttendanceFlag[]>();
    if (ids.length === 0) return map;
    const rows = await this.ds.getRepository(AttendanceFlag).find({ where: { attendanceId: In(ids) }, order: { id: 'ASC' } });
    for (const f of rows) map.set(f.attendanceId, [...(map.get(f.attendanceId) ?? []), f]);
    return map;
  }

  private async one(actor: CurrentUser, id: string): Promise<AttendanceDto> {
    const a = await this.repo.findOneOrFail({ where: { id }, relations: { faculty: true } });
    const { access } = await this.readable(actor, a.eventId);
    return toAttendanceDto(a, (await this.flagsOf([id])).get(id) ?? [], access === 'manage');
  }

  // Khoa su kien TRUOC roi moi khoa luot (cung thu tu voi thao tac hang loat) de khong deadlock.
  // [BM] luot khong ton tai hoac thuoc su kien ngoai pham vi deu tra 404 (lockScoped kiem tra pham vi).
  private async lockPair(m: EntityManager, actor: CurrentUser, id: string): Promise<{ a: Attendance; e: Event }> {
    const peek = await m.findOne(Attendance, { where: { id }, select: ['id', 'eventId'] });
    if (!peek) throw Err.notFound('lượt điểm danh');
    const e = await this.events.lockScoped(m, actor, peek.eventId);
    const a = await m.findOne(Attendance, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!a) throw Err.notFound('lượt điểm danh');
    return { a, e };
  }

  // sua / them / huy chi khi su kien con "mo" ve mat du lieu
  // viaAppeal: khieu nai con han duoc sua ca su kien da chot (dac ta 3.6)
  assertMutable(e: Event, viaAppeal = false): void {
    if (e.archivedAt) throw Err.conflict('EVENT_ARCHIVED', 'Sự kiện đang được lưu trữ, hãy khôi phục trước.');
    if (e.status === 'CANCELLED') throw Err.conflict('EVENT_CANCELLED', 'Sự kiện đã hủy.');
    if (e.status === 'FINALIZED' && !viaAppeal) throw Err.conflict('EVENT_FINALIZED', 'Sự kiện đã chốt, cần Đoàn trường mở khóa mới thay đổi được.');
    if (e.status === 'DRAFT') throw Err.conflict('INVALID_STATE', 'Sự kiện còn là bản nháp, chưa có điểm danh.');
  }

  applyReview(a: Attendance, status: ReviewDto['status'], reason: string | undefined, actorId: string): void {
    a.reviewStatus = status;
    if (status === 'PENDING') {
      a.reviewedBy = null;
      a.reviewedAt = null;
      a.reviewNote = null;
      return;
    }
    a.reviewedBy = actorId;
    a.reviewedAt = new Date();
    a.reviewNote = reason ?? null;
  }

  private async runBulk(m: EntityManager, eventId: string, dto: BulkDto, actorId: string): Promise<number> {
    const now = new Date();
    const ids = dto.ids ?? [];
    let res: { affectedRows: number };
    if (dto.action === 'VOID') {
      res = await m.query(
        'UPDATE attendances SET voided_at = ?, void_reason = ? WHERE event_id = ? AND id IN (?) AND voided_at IS NULL',
        [now, dto.reason, eventId, ids],
      );
    } else if (dto.action === 'APPROVE_CLEAN') {
      res = await m.query(
        `UPDATE attendances SET review_status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, review_note = NULL
          WHERE event_id = ? AND review_status = 'PENDING' AND voided_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM attendance_flags fl WHERE fl.attendance_id = attendances.id)`,
        [actorId, now, eventId],
      );
    } else {
      const status = dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      res = await m.query(
        'UPDATE attendances SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE event_id = ? AND id IN (?) AND voided_at IS NULL',
        [status, actorId, now, dto.action === 'REJECT' ? dto.reason : null, eventId, ids],
      );
    }
    return res.affectedRows;
  }

  // [NV] 3.7: trong mot su kien khong co hai luot cung MSSV (tru luot da huy)
  async assertMssvFree(m: EntityManager, eventId: string, mssv: string, exceptId: string | null): Promise<void> {
    const rows = await m.query(
      'SELECT id FROM attendances WHERE event_id = ? AND mssv = ? AND voided_at IS NULL AND id <> ? LIMIT 1',
      [eventId, mssv, exceptId ?? ''],
    );
    if (rows.length > 0) {
      throw Err.conflict('DUPLICATE_MSSV', 'MSSV này đã có lượt điểm danh trong sự kiện. Hãy sửa lượt đó hoặc hủy nó trước.');
    }
  }

  // checkWindow=false khi khong doi gio vao: luot that co the diem danh ngoai khung (QTV bam tay mo) nen khong kiem lai
  private assertTimes(e: Event, checkinAt: Date, checkoutAt: Date | null, checkWindow = true): void {
    if (checkWindow && (checkinAt < e.checkinOpenAt || checkinAt > e.checkinCloseAt)) {
      throw Err.bad('CHECKIN_OUT_OF_RANGE', 'Giờ điểm danh vào phải nằm trong khung giờ mở điểm danh của sự kiện.');
    }
    if (checkoutAt === null) return;
    if (!e.requireCheckout) throw Err.bad('CHECKOUT_DISABLED', 'Sự kiện này không có điểm danh ra.');
    if (checkoutAt < checkinAt) throw Err.bad('INVALID_CHECKOUT', 'Giờ điểm danh ra phải sau giờ điểm danh vào.');
  }

  // [NV] 3.1: dung gio neu diem danh truoc gio bat dau + an han
  private timeliness(e: Event, at: Date): 'ON_TIME' | 'LATE' {
    return at.getTime() <= e.startAt.getTime() + e.graceMinutes * 60_000 ? 'ON_TIME' : 'LATE';
  }

  private async applyEdit(m: EntityManager, e: Event, a: Attendance, dto: EditAttendanceAdminDto): Promise<void> {
    if (dto.mssv !== undefined) {
      const mssv = await this.lookup.validMssv(dto.mssv);
      if (mssv !== a.mssv) {
        await this.assertMssvFree(m, e.id, mssv, a.id);
        a.mssv = mssv;
      }
    }
    if (dto.fullName !== undefined) a.fullName = dto.fullName;
    if (dto.facultyUnitId !== undefined && dto.facultyUnitId !== a.facultyUnitId) {
      await this.lookup.assertFaculty(dto.facultyUnitId);
      a.facultyUnitId = dto.facultyUnitId;
    }
    if (dto.email !== undefined) a.email = dto.email;
    if (dto.checkinAt !== undefined) {
      a.checkinAt = dto.checkinAt;
      a.timeliness = this.timeliness(e, dto.checkinAt);
    }
    if (dto.checkoutAt !== undefined) a.checkoutAt = dto.checkoutAt;
    this.assertTimes(e, a.checkinAt, a.checkoutAt, dto.checkinAt !== undefined);
  }

  private ensureStudent(m: EntityManager, a: Attendance): Promise<unknown> {
    return m.query(
      `INSERT INTO students (mssv, full_name_latest, faculty_unit_id, first_seen_at, merged_into) VALUES (?, ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE full_name_latest = VALUES(full_name_latest), faculty_unit_id = VALUES(faculty_unit_id)`,
      [a.mssv, a.fullName, a.facultyUnitId, a.checkinAt],
    );
  }
}
