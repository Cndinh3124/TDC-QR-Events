// Diem danh vao / ra cua sinh vien - dac ta 3.3, 5.1, 5.2; chot-backend-hieu-nang.md
// Duong ghi toi gian: luat cung -> ghi DB (mot giao dich ngan) -> tra ket qua. Luat gan co chay nen (flag.worker.ts).
import { HttpException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomInt, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Err, isDuplicateError } from '../common/errors';
import { CheckinState } from '../events/event-rules';
import { Event } from '../events/entities/event.entity';
import { Attendance } from './entities/attendance.entity';
import { COUNTER_SLOTS } from './entities/event-counter.entity';
import { CodeGuardService } from './code-guard.service';
import { DeviceIdentity, DeviceService } from './device.service';
import { assertInsideRadius } from './geo-rule';
import { CheckinDto, CheckoutDto } from './dto/public.dto';
import { AttendanceView, PublicLookupService } from './public-lookup.service';
import { PublicContext } from './public-context.service';

export interface AttendanceResult {
  created: boolean; // false = gui lai cung idempotencyKey, tra ket qua cu
  body: { attendance: AttendanceView; state: CheckinState };
}

const CONFIRM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bo ky tu de nham (I, O, 0, 1)

export const newConfirmCode = (): string =>
  Array.from({ length: 8 }, () => CONFIRM_ALPHABET[randomInt(CONFIRM_ALPHABET.length)]).join('');

// khoa chet (1213) / het thoi gian cho khoa (1205) khi nhieu luot cung ghi: thu lai vai lan
export async function withRetry<T>(fn: () => Promise<T>, times = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const errno = (e?.driverError ?? e)?.errno;
      if (i >= times || (errno !== 1213 && errno !== 1205)) throw e;
      await new Promise((r) => setTimeout(r, 10 * i + randomInt(20)));
    }
  }
}

// cap nhat bang dem theo mot dong con ngau nhien de cac luot khong tranh nhau mot khoa dong
export async function bumpCounter(
  m: EntityManager,
  eventId: string,
  d: { checkin?: number; checkout?: number; onTime?: number; late?: number },
): Promise<void> {
  const v = [d.checkin ?? 0, d.checkout ?? 0, d.onTime ?? 0, d.late ?? 0];
  await m.query(
    `INSERT INTO event_counters (event_id, slot, checkin_count, checkout_count, on_time_count, late_count)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE checkin_count = checkin_count + VALUES(checkin_count),
       checkout_count = checkout_count + VALUES(checkout_count),
       on_time_count = on_time_count + VALUES(on_time_count), late_count = late_count + VALUES(late_count)`,
    [eventId, randomInt(COUNTER_SLOTS), ...v],
  );
}

export function enqueueEvaluation(m: EntityManager, attendanceId: string, payload: object | null, now: Date) {
  return m.query(
    "INSERT INTO attendance_jobs (attendance_id, status, run_at, attempts, payload_json, created_at) VALUES (?, 'PENDING', ?, 0, ?, ?)",
    [attendanceId, now, payload ? JSON.stringify(payload) : null, now],
  );
}

export function upsertBinding(m: EntityManager, mssv: string, deviceId: string, now: Date) {
  return m.query(
    `INSERT INTO student_devices (mssv, device_id, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at)`,
    [mssv, deviceId, now, now],
  );
}

@Injectable()
export class CheckinService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly lookup: PublicLookupService,
    private readonly devices: DeviceService,
    private readonly codes: CodeGuardService,
  ) {}

  async checkin(ctx: PublicContext, dto: CheckinDto): Promise<AttendanceResult> {
    const device = this.deviceOf(ctx);
    // B1 [BM]: token dung muc dich (QR vao), con hieu luc
    const { event } = await this.lookup.resolveToken(dto.token, 'CHECKIN');
    // B2 [NV] 5.1: trang thai diem danh that, bang checkinState
    const now = new Date();
    this.lookup.assertOpen(event, now);
    // B3 [NV] 3.8: dinh dang MSSV, khoa hop le, GPS di theo cap
    const mssv = await this.lookup.validMssv(dto.mssv);
    if ((dto.lat === undefined) !== (dto.lng === undefined)) {
      throw Err.bad('INVALID_GPS', 'Cần gửi đủ vĩ độ và kinh độ, hoặc không gửi cả hai.');
    }
    await this.lookup.assertFaculty(dto.facultyUnitId);
    // B3b [NV] 5.3: su kien co toa do thi chan cung khi thieu GPS / sai so lon / ngoai ban kinh
    const distanceM = assertInsideRadius(event, dto);
    // B4: ghi (UNIQUE event_id + device_id la chot cuoi chong ghi trung)
    const row = this.buildRow(event, device, ctx, dto, mssv, now);
    row.distanceM = distanceM;
    try {
      await withRetry(() => this.ds.transaction((m) => this.insertCheckin(m, event, device, row, ctx, dto, now)));
    } catch (e) {
      if (isDuplicateError(e)) return this.replay(event, device.id, dto.idempotencyKey);
      throw e;
    }
    return { created: true, body: { attendance: this.lookup.toView(row, 'OPEN'), state: 'OPEN' } };
  }

  async checkout(ctx: PublicContext, dto: CheckoutDto): Promise<AttendanceResult> {
    const device = this.deviceOf(ctx);
    const { event } = await this.lookup.resolveToken(dto.token, 'CHECKOUT');
    const now = new Date();
    this.lookup.assertOpen(event, now);
    // [NV] 3.3: phai co luot vao tu chinh thiet bi nay
    const att = await this.ds.getRepository(Attendance).findOne({ where: { eventId: event.id, deviceId: device.id } });
    if (!att || att.voidedAt) {
      throw Err.conflict('NO_CHECKIN', 'Bạn chưa điểm danh vào sự kiện này bằng thiết bị này.');
    }
    // gui lai cung khoa thi tra ket qua cu, khong doi lai ma
    if (att.checkoutAt) return this.checkoutReplay(att, dto.idempotencyKey);
    // [NV] 5.3: diem danh ra cung phai co mat tai cho
    assertInsideRadius(event, dto);
    if (event.controlLevel === 'TIGHT') await this.verifyCode(event, att, dto.verifyCode, now);

    const done = await withRetry(() => this.ds.transaction((m) => this.writeCheckout(m, event, att, dto.idempotencyKey, now)));
    if (!done) {
      // co request khac ghi truoc trong luc ta kiem tra
      const fresh = await this.ds.getRepository(Attendance).findOneByOrFail({ id: att.id });
      return this.checkoutReplay(fresh, dto.idempotencyKey);
    }
    att.checkoutAt = now;
    return { created: true, body: { attendance: this.lookup.toView(att, 'OPEN'), state: 'OPEN' } };
  }

  // ---------- noi bo ----------

  private deviceOf(ctx: PublicContext): DeviceIdentity {
    if (!ctx.device) throw Err.bad('NO_DEVICE', 'Không xác định được thiết bị.');
    return ctx.device;
  }

  private buildRow(e: Event, d: DeviceIdentity, ctx: PublicContext, dto: CheckinDto, mssv: string, now: Date): Attendance {
    const onTime = now.getTime() <= e.startAt.getTime() + e.graceMinutes * 60_000; // [NV] 3.1
    return this.ds.getRepository(Attendance).create({
      id: randomUUID(), eventId: e.id, deviceId: d.id, mssv, fullName: dto.fullName,
      email: dto.email ?? null, facultyUnitId: dto.facultyUnitId, checkinAt: now, checkoutAt: null,
      timeliness: onTime ? 'ON_TIME' : 'LATE',
      lat: dto.lat ?? null, lng: dto.lng ?? null,
      gpsAccuracyM: dto.accuracyM === undefined ? null : Math.round(dto.accuracyM), distanceM: null,
      ip: ctx.ip, userAgent: ctx.userAgent, editCount: 0, source: 'SELF', reviewStatus: 'PENDING',
      reviewedBy: null, reviewedAt: null, drlAwarded: null, confirmCode: newConfirmCode(),
      idempotencyKey: dto.idempotencyKey, checkoutIdempotencyKey: null, codeFailCount: 0, codeLockedUntil: null,
      voidedAt: null, voidReason: null,
    });
  }

  // Mot giao dich: thiet bi -> luot -> cap MSSV/thiet bi -> viec nen -> bang dem (cuoi cung de giu khoa ngan nhat)
  private async insertCheckin(
    m: EntityManager, e: Event, d: DeviceIdentity, row: Attendance, ctx: PublicContext, dto: CheckinDto, now: Date,
  ): Promise<void> {
    const fp = dto.fingerprint ? this.devices.fingerprintHash(dto.fingerprint) : null;
    await m.query(
      `INSERT INTO devices (id, first_seen_at, last_seen_at, fingerprint_hash) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at),
         fingerprint_hash = COALESCE(VALUES(fingerprint_hash), fingerprint_hash)`,
      [d.id, now, now, fp],
    );
    await m.insert(Attendance, row);
    await upsertBinding(m, row.mssv, d.id, now);
    await enqueueEvaluation(m, row.id, { newDevice: ctx.isNewDevice }, now);
    await bumpCounter(m, e.id, { checkin: 1, onTime: row.timeliness === 'ON_TIME' ? 1 : 0, late: row.timeliness === 'LATE' ? 1 : 0 });
  }

  // [NV] 5.1: thiet bi da co luot -> khong tao luot moi, tra luot cu de giao dien hien nut "Sua thong tin"
  private async replay(event: Event, deviceId: string, key: string): Promise<AttendanceResult> {
    const state: CheckinState = 'OPEN';
    const existing = await this.ds.getRepository(Attendance).findOne({ where: { eventId: event.id, deviceId } });
    if (!existing) throw Err.conflict('IDEMPOTENCY_KEY_REUSED', 'Mã yêu cầu đã được dùng, vui lòng thử lại.');
    const attendance = this.lookup.toView(existing, state);
    if (existing.idempotencyKey === key) return { created: false, body: { attendance, state } };
    throw new HttpException(
      { statusCode: 409, code: 'DEVICE_ALREADY_CHECKED_IN', message: 'Thiết bị này đã điểm danh sự kiện này.', attendance },
      409,
    );
  }

  private checkoutReplay(att: Attendance, key: string): AttendanceResult {
    const attendance = this.lookup.toView(att, 'OPEN');
    if (att.checkoutIdempotencyKey === key) return { created: false, body: { attendance, state: 'OPEN' } };
    throw new HttpException(
      { statusCode: 409, code: 'ALREADY_CHECKED_OUT', message: 'Bạn đã điểm danh ra rồi.', attendance },
      409,
    );
  }

  // [BM] thu tu: bat buoc co ma -> tran su kien -> lay phieu cua luot -> so sanh -> ghi nhan that bai
  private async verifyCode(event: Event, att: Attendance, code: string | undefined, now: Date): Promise<void> {
    if (!code) throw Err.bad('VERIFY_CODE_REQUIRED', 'Cần nhập mã 4 số do ban tổ chức đọc tại chỗ.');
    await this.codes.assertEventNotPaused(event.id, now);
    await this.codes.takeTicket(att.id, now);
    if (this.codes.matches(event, code)) return;
    await this.codes.recordEventFailure(event.id, now);
    const attemptsLeft = await this.codes.attemptsLeft(att.id);
    throw new HttpException(
      { statusCode: 400, code: 'VERIFY_CODE_INVALID', message: 'Mã 4 số không đúng.', attemptsLeft },
      400,
    );
  }

  // false khi da co request khac ghi diem danh ra truoc
  private async writeCheckout(m: EntityManager, e: Event, a: Attendance, key: string, now: Date): Promise<boolean> {
    const res = await m.query(
      `UPDATE attendances SET checkout_at = ?, checkout_idempotency_key = ?, code_fail_count = 0, code_locked_until = NULL
        WHERE id = ? AND checkout_at IS NULL AND voided_at IS NULL`,
      [now, key, a.id],
    );
    if (res.affectedRows === 0) return false;
    await bumpCounter(m, e.id, { checkout: 1 });
    return true;
  }
}
