// Khieu nai cua sinh vien (khong co tai khoan): gui, xem lai khieu nai cua thiet bi minh - dac ta 3.5
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import { Appeal, AppealStatus, AppealType } from '../appeals/appeal.entity';
import { appError, Err, isDuplicateError } from '../common/errors';
import { Event } from '../events/entities/event.entity';
import { Attendance } from './entities/attendance.entity';
import { DeviceIdentity } from './device.service';
import { CreateAppealDto } from './dto/appeal.dto';
import { PublicLookupService } from './public-lookup.service';

const MAX_PENDING_PER_STUDENT = 3; // chong gui lien tuc cung mot MSSV trong mot su kien

export interface AppealView {
  id: string;
  type: AppealType;
  status: AppealStatus;
  deadlineAt: Date;
  createdAt: Date;
  resolutionNote: string | null;
  eventTitle?: string;
}

const toView = (a: Appeal, eventTitle?: string): AppealView => ({
  id: a.id, type: a.type, status: a.status, deadlineAt: a.deadlineAt, createdAt: a.createdAt,
  // [BM] ghi chu xu ly chi tra cho khieu nai da xu ly, cho thiet bi gui
  resolutionNote: a.status === 'PENDING' ? null : a.resolutionNote,
  ...(eventTitle ? { eventTitle } : {}),
});

@Injectable()
export class AppealPublicService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly lookup: PublicLookupService,
  ) {}

  async create(device: DeviceIdentity | null, dto: CreateAppealDto): Promise<{ created: boolean; appeal: AppealView }> {
    if (!device) throw Err.bad('NO_DEVICE', 'Không xác định được thiết bị.');
    const { event } = await this.lookup.resolveToken(dto.token);
    const deadlineAt = await this.lookup.appealDeadline(event);
    this.assertCanAppeal(event, deadlineAt, new Date());

    const mine = await this.ds.getRepository(Attendance).findOne({ where: { eventId: event.id, deviceId: device.id } });
    const who = mine && !mine.voidedAt ? await this.fromAttendance(mine) : await this.fromBody(event, dto);

    const dup = await this.ds.getRepository(Appeal).findOne({ where: { eventId: event.id, idempotencyKey: dto.idempotencyKey } });
    if (dup) return this.replay(dup, device);
    const [{ n }] = await this.ds.query(
      "SELECT COUNT(*) AS n FROM appeals WHERE event_id = ? AND mssv = ? AND status = 'PENDING'",
      [event.id, who.mssv],
    );
    if (Number(n) >= MAX_PENDING_PER_STUDENT) {
      throw Err.conflict('TOO_MANY_APPEALS', 'Bạn đã có nhiều khiếu nại đang chờ xử lý cho sự kiện này, vui lòng đợi kết quả.');
    }
    const row = this.ds.getRepository(Appeal).create({
      id: randomUUID(), eventId: event.id, attendanceId: who.attendanceId, deviceId: device.id, mssv: who.mssv,
      fullName: who.fullName, facultyUnitId: who.facultyUnitId, type: dto.type, content: dto.content, status: 'PENDING',
      deadlineAt, handledBy: null, handledAt: null, resolutionNote: null, idempotencyKey: dto.idempotencyKey,
    });
    try {
      await this.ds.getRepository(Appeal).insert(row);
    } catch (e) {
      if (!isDuplicateError(e)) throw e;
      const again = await this.ds.getRepository(Appeal).findOneByOrFail({ eventId: event.id, idempotencyKey: dto.idempotencyKey });
      return this.replay(again, device);
    }
    return { created: true, appeal: toView(row) };
  }

  // khieu nai da gui tu thiet bi nay (moi nhat truoc)
  async mine(device: DeviceIdentity | null): Promise<{ items: AppealView[] }> {
    if (!device) return { items: [] };
    const rows = await this.ds.getRepository(Appeal).find({ where: { deviceId: device.id }, order: { createdAt: 'DESC' }, take: 50 });
    if (rows.length === 0) return { items: [] };
    const events = await this.ds.getRepository(Event).find({ where: { id: In(rows.map((r) => r.eventId)) } });
    const title = new Map(events.map((e) => [e.id, e.title]));
    return { items: rows.map((r) => toView(r, title.get(r.eventId))) };
  }

  // [NV] 3.5: het han (ket thuc su kien + appeal_days), su kien nhap / huy / luu tru -> tu choi
  assertCanAppeal(event: Event, deadlineAt: Date, now: Date): void {
    if (event.archivedAt || event.status === 'DRAFT' || event.status === 'CANCELLED') {
      throw Err.conflict('APPEAL_NOT_AVAILABLE', 'Sự kiện này không nhận khiếu nại.');
    }
    if (now > deadlineAt) throw appError(409, 'APPEAL_EXPIRED', 'Đã hết thời hạn gửi khiếu nại của sự kiện này.');
  }

  private async fromAttendance(a: Attendance) {
    return { attendanceId: a.id, mssv: a.mssv, fullName: a.fullName, facultyUnitId: a.facultyUnitId };
  }

  // chua co luot tren thiet bi nay: khai MSSV + ho ten + khoa; lien ket luot cung MSSV (neu co) de nguoi xu ly de doi chieu
  private async fromBody(event: Event, dto: CreateAppealDto) {
    if (!dto.mssv || !dto.fullName || !dto.facultyUnitId) {
      throw Err.bad('APPEAL_IDENTITY_REQUIRED', 'Thiết bị này chưa điểm danh sự kiện. Hãy nhập MSSV, họ tên và khoa.');
    }
    const mssv = await this.lookup.validMssv(dto.mssv);
    await this.lookup.assertFaculty(dto.facultyUnitId);
    const found = await this.ds.getRepository(Attendance).findOne({ where: { eventId: event.id, mssv }, select: ['id', 'voidedAt'] });
    return {
      attendanceId: found && !found.voidedAt ? found.id : null, mssv, fullName: dto.fullName, facultyUnitId: dto.facultyUnitId,
    };
  }

  // [BM] gui lai cung khoa: chi thiet bi da gui moi nhan lai ket qua cu
  private replay(a: Appeal, device: DeviceIdentity): { created: boolean; appeal: AppealView } {
    if (a.deviceId !== device.id) throw Err.conflict('IDEMPOTENCY_KEY_REUSED', 'Mã yêu cầu đã được dùng, vui lòng thử lại.');
    return { created: false, appeal: toView(a) };
  }
}
