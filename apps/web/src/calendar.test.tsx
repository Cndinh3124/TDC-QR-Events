import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const calls: unknown[][] = [];
let reply: () => Promise<unknown> = async () => undefined;
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  api: (...a: unknown[]) => { calls.push(a); return reply(); },
}));
vi.mock('./auth', () => ({ useAuth: () => ({ user: { role: 'FACULTY_MANAGER' } }) }));
const { ActivityCalendar, monthGrid, onDay, parseMonth, shiftMonth } = await import('./pages/ActivityCalendar');

describe('lich thang - ham thuan', () => {
  it('monthGrid: bat dau thu Hai, ket thuc Chu nhat, du tuan', () => {
    const nov = monthGrid(2026, 11); // 01/11/2026 la Chu nhat
    expect(nov[0]).toBe('2026-10-26');
    expect(nov[nov.length - 1]).toBe('2026-12-06');
    expect(nov.length % 7).toBe(0);
    const feb = monthGrid(2027, 2); // 01/02/2027 la thu Hai, 28 ngay
    expect(feb[0]).toBe('2027-02-01');
    expect(feb).toHaveLength(28);
  });

  it('parseMonth / shiftMonth: qua nam dung; gia tri sai thi ve thang hien tai', () => {
    expect(parseMonth('2026-11')).toEqual([2026, 11]);
    expect(parseMonth('2026-13', Date.UTC(2026, 4, 10))).toEqual([2026, 5]);
    expect(parseMonth(null, Date.UTC(2026, 11, 31, 18))).toEqual([2027, 1]); // 01h ngay 01/01/2027 gio VN
    expect(shiftMonth(2026, 12, 1)).toEqual([2027, 1]);
    expect(shiftMonth(2027, 1, -1)).toEqual([2026, 12]);
  });

  it('onDay: tinh theo gio Viet Nam, hoat dong nhieu ngay phu moi ngay', () => {
    // 23h00 ngay 04/11 UTC = 06h00 ngay 05/11 gio VN
    expect(onDay('2026-11-05', '2026-11-04T23:00:00Z', '2026-11-05T01:00:00Z')).toBe(true);
    expect(onDay('2026-11-04', '2026-11-04T23:00:00Z', '2026-11-05T01:00:00Z')).toBe(false);
    expect(onDay('2026-11-10', '2026-11-01T01:00:00Z', '2026-11-20T01:00:00Z')).toBe(true);
  });
});

describe('ActivityCalendar', () => {
  it('goi API dung khoang luoi, hien hoat dong va buoi diem danh co lien ket', async () => {
    reply = async () => ({
      truncated: false,
      activities: [{ id: 'a1', code: '2026-001', name: 'Mùa hè xanh', startAt: '2026-11-03T01:00:00Z', endAt: '2026-11-04T10:00:00Z', status: 'IN_PROGRESS', unit: null, coUnit: false }],
      events: [{ id: 'e1', title: 'Hội thảo AI', startAt: '2026-11-05T01:00:00Z', endAt: '2026-11-05T03:00:00Z', status: 'PUBLISHED', locationName: null, unit: null, canManage: true }],
    });
    render(<MemoryRouter initialEntries={['/hoat-dong/lich?thang=2026-11']}><ActivityCalendar /></MemoryRouter>);
    expect(await screen.findByText('Tháng 11/2026')).toBeInTheDocument();
    expect(calls.at(-1)).toEqual(['GET', '/admin/activity-calendar?from=2026-10-26&to=2026-12-06']);
    const chips = await screen.findAllByRole('link', { name: 'Mùa hè xanh' });
    expect(chips).toHaveLength(2); // 03 va 04/11
    expect(chips[0]).toHaveAttribute('href', '/hoat-dong/a1');
    expect(screen.getByRole('link', { name: /Hội thảo AI/ })).toHaveAttribute('href', '/su-kien/e1');
  });
});
