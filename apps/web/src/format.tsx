// Dinh dang thoi gian + nhan trang thai su kien (mau theo chot-giao-dien.md muc 2)
import type { EventStatus } from './api';

export const fmt = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

const STATUS: Record<EventStatus, [string, string]> = {
  DRAFT: ['Nháp', 'draft'],
  PUBLISHED: ['Đã công bố', 'info'],
  CHECKIN_OPEN: ['Đang điểm danh', 'ok'],
  CHECKIN_CLOSED: ['Đã đóng điểm danh', 'draft'],
  REVIEWING: ['Chờ duyệt', 'wait'],
  FINALIZED: ['Hoàn tất', 'ok'],
  CANCELLED: ['Đã hủy', 'err'],
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const [label, tone] = STATUS[status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

// <input type="datetime-local"> (gio may) -> ISO 8601 co mui gio, dung dinh dang API yeu cau
export const toIso = (local: string) => new Date(local).toISOString();

export const FLAG_LABEL: Record<string, string> = {
  DUPLICATE_MSSV: 'Trùng MSSV',
  DEVICE_MULTI_MSSV: 'Thiết bị dùng cho nhiều MSSV',
  MSSV_MULTI_DEVICE: 'MSSV dùng nhiều thiết bị',
  NAME_MISMATCH: 'Tên khác lần trước',
  FACULTY_MISMATCH: 'Khoa khác lần trước',
  NEW_DEVICE: 'Thiết bị mới',
  BURST_SAME_FINGERPRINT: 'Nhiều MSSV cùng máy',
  GPS_OUTSIDE: 'Ngoài vùng GPS',
  GPS_LOW_ACCURACY: 'GPS kém chính xác',
  GPS_MISSING: 'Không có GPS',
  NO_CHECKOUT: 'Chưa điểm danh ra',
  MANUAL_ENTRY: 'Thêm thủ công',
};

export const REVIEW_LABEL: Record<string, [string, string]> = {
  PENDING: ['Chờ duyệt', 'wait'],
  APPROVED: ['Đã duyệt', 'ok'],
  REJECTED: ['Từ chối', 'err'],
};

export const APPEAL_TYPE_LABEL: Record<string, string> = {
  WRONG_INFO: 'Sai thông tin',
  NO_CHECKIN: 'Có tham gia nhưng không điểm danh được',
  PROXY_CHECKIN: 'Bị điểm danh hộ',
  DUPLICATE_MSSV: 'Trùng MSSV',
};

// ISO -> gia tri cho <input type="datetime-local"> theo gio may
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const ROLE_LABEL: Record<string, string> = { SCHOOL_ADMIN: 'Quản trị Đoàn trường', FACULTY_MANAGER: 'Quản lý khoa' };

// so thay doi so voi ky truoc: "+12%", "-5%", "mới" (ky truoc = 0), "—" (khong co du lieu)
export function delta(value: number, previous: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (previous === 0) return value === 0 ? { text: '—', tone: 'flat' } : { text: 'mới', tone: 'up' };
  const pct = Math.round(((value - previous) / previous) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

// ngay YYYY-MM-DD (gio Viet Nam) cua mot moc thoi gian
export const vnDay = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

export const dmy = (day: string) => day.split('-').reverse().join('/');
