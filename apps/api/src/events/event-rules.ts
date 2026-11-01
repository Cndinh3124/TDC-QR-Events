// Quy tac thuan cua su kien (khong cham DB): trang thai diem danh, lich, DRL, toa do - dac ta 3.1, 3.7
import { Err } from '../common/errors';
import { Event, EventStatus } from './entities/event.entity';

export type CheckinState = 'NOT_AVAILABLE' | 'NOT_YET' | 'OPEN' | 'CLOSED';

type TimeFields = Pick<Event, 'startAt' | 'endAt' | 'checkinOpenAt' | 'checkinCloseAt'>;
type StateFields = Pick<Event, 'status' | 'archivedAt' | 'checkinOpenAt' | 'checkinCloseAt'>;

// Trang thai diem danh THAT tai thoi diem now - giai doan 3 dung de chan / cho diem danh.
// [NV] 3.1: bam tay (CHECKIN_OPEN / CHECKIN_CLOSED) luon uu tien; PUBLISHED thi tu dong theo khung gio.
export function checkinState(e: StateFields, now: Date): CheckinState {
  if (e.archivedAt || e.status === 'DRAFT' || e.status === 'CANCELLED') return 'NOT_AVAILABLE';
  if (e.status === 'CHECKIN_OPEN') return 'OPEN';
  if (e.status === 'CHECKIN_CLOSED' || e.status === 'REVIEWING' || e.status === 'FINALIZED') return 'CLOSED';
  if (now < e.checkinOpenAt) return 'NOT_YET';
  return now < e.checkinCloseAt ? 'OPEN' : 'CLOSED';
}

// "Da mo diem danh": tu day sua gio / toa do / DRL phai co ly do - dac ta 3.7
export function hasCheckinStarted(e: StateFields, now: Date): boolean {
  const manual: EventStatus[] = ['CHECKIN_OPEN', 'CHECKIN_CLOSED', 'REVIEWING', 'FINALIZED'];
  return manual.includes(e.status) || (e.status === 'PUBLISHED' && now >= e.checkinOpenAt);
}

export function assertValidSchedule(t: TimeFields): void {
  if (!(t.startAt < t.endAt)) throw Err.bad('INVALID_SCHEDULE', 'Giờ kết thúc phải sau giờ bắt đầu.');
  if (!(t.checkinOpenAt < t.checkinCloseAt)) {
    throw Err.bad('INVALID_SCHEDULE', 'Giờ đóng điểm danh phải sau giờ mở điểm danh.');
  }
  // mo diem danh sau khi su kien ket thuc la vo nghia (dong muon hon end_at thi duoc: diem danh ra)
  if (!(t.checkinOpenAt < t.endAt)) {
    throw Err.bad('INVALID_SCHEDULE', 'Giờ mở điểm danh phải trước giờ kết thúc sự kiện.');
  }
}

// [NV] 3.1: co DRL thi 1-10, khong cong DRL thi khong nhap diem
export function assertValidDrl(hasDrl: boolean, points: number | null): void {
  if (hasDrl && (points === null || !Number.isInteger(points) || points < 1 || points > 10)) {
    throw Err.bad('INVALID_DRL', 'Điểm rèn luyện phải là số nguyên từ 1 đến 10.');
  }
  if (!hasDrl && points !== null) {
    throw Err.bad('INVALID_DRL', 'Sự kiện không cộng điểm rèn luyện thì không nhập điểm.');
  }
}

// toa do + ban kinh: co du ca ba hoac khong co gi
export function assertValidGeo(lat: number | null, lng: number | null, radius: number | null): void {
  const set = [lat, lng, radius].filter((v) => v !== null).length;
  if (set !== 0 && set !== 3) {
    throw Err.bad('INVALID_GEO', 'Cần nhập đủ vĩ độ, kinh độ và bán kính, hoặc để trống cả ba.');
  }
}
