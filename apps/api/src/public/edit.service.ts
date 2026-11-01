// Sinh vien sua thong tin luot diem danh - dac ta 3.4
// [NV] 3.4: dung thiet bi da diem danh, khi con mo diem danh, toi da 3 lan; sua = cap nhat luot cu (gio diem danh giu nguyen).
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Err } from '../common/errors';
import { checkinState } from '../events/event-rules';
import { Event } from '../events/entities/event.entity';
import { Attendance } from './entities/attendance.entity';
import { AttendanceEdit } from './entities/attendance-edit.entity';
import { enqueueEvaluation, upsertBinding, withRetry } from './checkin.service';
import { DeviceIdentity } from './device.service';
import { EditAttendanceDto } from './dto/public.dto';
import { PublicLookupService, AttendanceView } from './public-lookup.service';
import { MAX_EDITS } from './public.constants';

type Fields = Pick<Attendance, 'mssv' | 'fullName' | 'email' | 'facultyUnitId'>;
interface Change {
  next: Fields;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

@Injectable()
export class EditService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly lookup: PublicLookupService,
  ) {}

  async edit(device: DeviceIdentity | null, id: string, dto: EditAttendanceDto): Promise<{ attendance: AttendanceView }> {
    // B1 [BM]: khong dung thiet bi thi tra 404 nhu khong ton tai (khong lo luot cua nguoi khac)
    const att = await this.ds.getRepository(Attendance).findOne({ where: { id } });
    if (!device || !att || att.deviceId !== device.id) throw Err.notFound('lượt điểm danh');
    // B2 [NV] 3.4: chi sua khi con mo diem danh; sau khi dong thi gui khieu nai
    const event = await this.ds.getRepository(Event).findOneByOrFail({ id: att.eventId });
    const now = new Date();
    if (checkinState(event, now) !== 'OPEN') {
      throw Err.conflict('EDIT_CLOSED', 'Sự kiện đã đóng điểm danh, bạn không thể sửa nữa. Hãy gửi khiếu nại nếu cần.');
    }
    // B3: kiem tra du lieu moi (MSSV theo cau hinh, khoa hop le)
    if (dto.facultyUnitId !== undefined) await this.lookup.assertFaculty(dto.facultyUnitId);
    const mssv = dto.mssv === undefined ? undefined : await this.lookup.validMssv(dto.mssv);
    // B4: khoa dong luot, kiem tra lai va ghi
    return withRetry(() => this.ds.transaction((m) => this.apply(m, device, id, dto, mssv, now)));
  }

  private async apply(
    m: EntityManager, device: DeviceIdentity, id: string, dto: EditAttendanceDto, mssv: string | undefined, now: Date,
  ): Promise<{ attendance: AttendanceView }> {
    const att = await m.findOne(Attendance, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!att || att.deviceId !== device.id || att.voidedAt) throw Err.notFound('lượt điểm danh');

    // gui lai cung khoa: tra ket qua hien tai, khong tinh them mot lan sua
    const done = await m.count(AttendanceEdit, { where: { attendanceId: id, idempotencyKey: dto.idempotencyKey } });
    if (done > 0) return { attendance: this.lookup.toView(att, 'OPEN') };

    if (att.editCount >= MAX_EDITS) {
      throw Err.conflict('EDIT_LIMIT_REACHED', `Bạn đã sửa tối đa ${MAX_EDITS} lần, không thể sửa thêm.`);
    }
    const change = this.diff(att, dto, mssv);
    if (!change) throw Err.bad('NO_CHANGES', 'Không có thông tin nào thay đổi.');

    Object.assign(att, change.next, { editCount: att.editCount + 1 });
    await m.save(Attendance, att);
    await m.query(
      `INSERT INTO attendance_edits (attendance_id, old_json, new_json, actor_type, actor_id, reason, idempotency_key)
       VALUES (?, ?, ?, 'STUDENT', ?, NULL, ?)`,
      [id, JSON.stringify(change.before), JSON.stringify(change.after), device.id, dto.idempotencyKey],
    );
    // [NV] 5.3: doi MSSV -> them cap MSSV/thiet bi moi de worker thay thiet bi tung gan MSSV khac
    if (change.after.mssv !== undefined) await upsertBinding(m, att.mssv, device.id, now);
    await enqueueEvaluation(m, id, { edit: true }, now);
    return { attendance: this.lookup.toView(att, 'OPEN') };
  }

  // chi lay truong thuc su doi; null = khong co gi doi
  private diff(att: Attendance, dto: EditAttendanceDto, mssv: string | undefined): Change | null {
    const next: Fields = { mssv: att.mssv, fullName: att.fullName, email: att.email, facultyUnitId: att.facultyUnitId };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const set = <K extends keyof Fields>(k: K, v: Fields[K] | undefined) => {
      if (v === undefined || v === att[k]) return;
      before[k] = att[k];
      after[k] = v;
      next[k] = v;
    };
    set('mssv', mssv);
    set('fullName', dto.fullName);
    set('facultyUnitId', dto.facultyUnitId);
    set('email', dto.email);
    return Object.keys(after).length ? { next, before, after } : null;
  }
}
