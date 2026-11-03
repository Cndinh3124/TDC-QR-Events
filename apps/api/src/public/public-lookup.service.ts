// Tra token QR, kiem tra trang thai diem danh, MSSV, khoa va dung "ve" tra ve cho sinh vien - dac ta 3.3, 3.8, 5.1
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { appError, Err } from '../common/errors';
import { checkinState, CheckinState } from '../events/event-rules';
import { Event } from '../events/entities/event.entity';
import { EventQrToken, QrPurpose } from '../events/entities/event-qr-token.entity';
import { SettingsService } from '../settings/settings.service';
import { Unit } from '../units/entities/unit.entity';
import { Attendance, Timeliness } from './entities/attendance.entity';
import { normalizeMssv } from './flag-rules';
import { MAX_EDITS, MAX_MSSV_LEN, TOKEN_RE } from './public.constants';

export interface ResolvedToken {
  event: Event;
  purpose: QrPurpose;
}

// "Ve" diem danh tra cho chinh thiet bi da diem danh (khong chua IP, GPS, co)
export interface AttendanceView {
  id: string;
  mssv: string;
  fullName: string;
  email: string | null;
  facultyUnitId: string;
  checkinAt: Date;
  checkoutAt: Date | null;
  timeliness: Timeliness;
  confirmCode: string;
  editCount: number;
  editsLeft: number;
  canEdit: boolean;
}

const STATE_ERROR: Record<Exclude<CheckinState, 'OPEN'>, [string, string]> = {
  NOT_YET: ['CHECKIN_NOT_YET', 'Sự kiện chưa mở điểm danh.'],
  CLOSED: ['CHECKIN_CLOSED', 'Sự kiện đã đóng điểm danh.'],
  NOT_AVAILABLE: ['CHECKIN_NOT_AVAILABLE', 'Sự kiện hiện không nhận điểm danh.'],
};

@Injectable()
export class PublicLookupService {
  private readonly regexCache = new Map<string, RegExp>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
  ) {}

  // [BM] moi ly do that bai (sai, da doi ma, da tat) deu tra cung mot 404 de khong lo gi cho nguoi do ma
  async resolveToken(token: string, want?: QrPurpose): Promise<ResolvedToken> {
    const invalid = () => appError(404, 'QR_INVALID', 'Mã QR không hợp lệ hoặc đã được thay mới.');
    if (!TOKEN_RE.test(token)) throw invalid();
    const { entities, raw } = await this.ds
      .createQueryBuilder(Event, 'e')
      .innerJoin(EventQrToken, 't', 't.eventId = e.id')
      .addSelect('t.purpose', 'purpose')
      .where('t.token = :token AND t.isActive = :on', { token, on: true })
      .getRawAndEntities();
    const purpose = raw[0]?.purpose as QrPurpose | undefined;
    if (!entities[0] || !purpose || (want && purpose !== want)) throw invalid();
    return { event: entities[0], purpose };
  }

  // [NV] 5.1: ngoai khung gio mo, su kien da huy / luu tru -> tu choi. Luon dung checkinState, khong doc status truc tiep.
  assertOpen(event: Event, now: Date): void {
    const s = checkinState(event, now);
    if (s === 'OPEN') return;
    const [code, message] = STATE_ERROR[s];
    throw Err.conflict(code, message);
  }

  // [NV] 3.8: chuan hoa roi kiem tra theo bieu thuc trong cau hinh
  async validMssv(raw: string): Promise<string> {
    const mssv = normalizeMssv(raw);
    const re = await this.mssvRegex();
    if (mssv.length > MAX_MSSV_LEN || !re.test(mssv)) {
      throw Err.bad('INVALID_MSSV', 'MSSV không đúng định dạng, ví dụ: 24211TM1152.');
    }
    return mssv;
  }

  // [NV] 2.1: chi chon duoc khoa that, dang hoat dong (khong phai Doan truong)
  async assertFaculty(unitId: string): Promise<void> {
    const ok = await this.ds.getRepository(Unit).count({ where: { id: unitId, type: 'FACULTY', isActive: true } });
    if (!ok) throw Err.bad('INVALID_FACULTY', 'Khoa không hợp lệ.');
  }

  // [NV] 3.5: han khieu nai = ket thuc su kien + appeal_days (cau hinh, mac dinh 7)
  async appealDeadline(event: Pick<Event, 'endAt'>): Promise<Date> {
    const days = await this.appealDays();
    return new Date(event.endAt.getTime() + days * 24 * 3600_000);
  }

  appealDays(): Promise<number> {
    return this.settings.get<number>('appeal_days');
  }

  async mssvRegex(): Promise<RegExp> {
    const src = await this.settings.get<string>('mssv_regex');
    let re = this.regexCache.get(src);
    if (!re) {
      re = new RegExp(src); // da qua kiem tra ReDoS khi luu cau hinh
      this.regexCache.set(src, re);
    }
    return re;
  }

  toView(a: Attendance, state: CheckinState): AttendanceView {
    const editsLeft = Math.max(0, MAX_EDITS - a.editCount);
    return {
      id: a.id,
      mssv: a.mssv,
      fullName: a.fullName,
      email: a.email,
      facultyUnitId: a.facultyUnitId,
      checkinAt: a.checkinAt,
      checkoutAt: a.checkoutAt,
      timeliness: a.timeliness,
      confirmCode: a.confirmCode,
      editCount: a.editCount,
      editsLeft,
      // [NV] 3.4: chi sua khi con mo diem danh va chua het 3 lan
      canEdit: state === 'OPEN' && editsLeft > 0 && a.voidedAt === null,
    };
  }
}
