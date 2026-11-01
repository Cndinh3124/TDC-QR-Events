import { describe, expect, it } from 'vitest';
import { delta, dmy, eventBadge, toLocalInput, vnDay } from './format';
import { clock } from './pages/Present';

describe('eventBadge', () => {
  it('PUBLISHED trong khung gio la "Dang diem danh" (khong chi doc status)', () => {
    expect(eventBadge('PUBLISHED', 'OPEN')).toEqual(['Đang điểm danh', 'ok']);
  });
  it('PUBLISHED qua gio dong la "Da dong diem danh"', () => {
    expect(eventBadge('PUBLISHED', 'CLOSED')).toEqual(['Đã đóng điểm danh', 'draft']);
  });
  it('PUBLISHED chua toi gio van la "Da cong bo"', () => {
    expect(eventBadge('PUBLISHED', 'NOT_YET')).toEqual(['Đã công bố', 'info']);
  });
  it('luu tru uu tien hon moi trang thai khac', () => {
    expect(eventBadge('FINALIZED', 'CLOSED', true)).toEqual(['Lưu trữ', 'draft']);
  });
  it('da huy la mau loi', () => {
    expect(eventBadge('CANCELLED', 'NOT_AVAILABLE')[1]).toBe('err');
  });
});

describe('delta so voi ky truoc', () => {
  it('tang, giam, khong doi, ky truoc bang 0', () => {
    expect(delta(120, 100)).toEqual({ text: '+20%', tone: 'up' });
    expect(delta(80, 100)).toEqual({ text: '-20%', tone: 'down' });
    expect(delta(100, 100)).toEqual({ text: '0%', tone: 'flat' });
    expect(delta(5, 0)).toEqual({ text: 'mới', tone: 'up' });
    expect(delta(0, 0)).toEqual({ text: '—', tone: 'flat' });
  });
});

describe('ngay gio', () => {
  it('vnDay tinh theo gio Viet Nam (UTC+7)', () => {
    expect(vnDay(Date.UTC(2026, 10, 1, 18, 0))).toBe('2026-11-02'); // 01:00 ngay 2/11 gio VN
    expect(dmy('2026-11-02')).toBe('02/11/2026');
  });
  it('toLocalInput tra ve chuoi rong khi khong co gio', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('2026-11-01T10:05:00Z')).toMatch(/^2026-11-01T\d{2}:05$/);
  });
});

describe('dong ho dem nguoc cua man trinh chieu', () => {
  it('dinh dang HH:MM:SS va khong am', () => {
    expect(clock(3_723_000)).toBe('01:02:03');
    expect(clock(59_999)).toBe('00:00:59');
    expect(clock(-5000)).toBe('00:00:00');
  });
});
