import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceRow } from '../api';

// goi API gia: ghi lai tham so, tra ket qua do tung test dat (khong dung vi.fn cho promise bi tu choi)
const calls: unknown[][] = [];
let reply: () => Promise<unknown> = async () => undefined;
vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  api: (...a: unknown[]) => { calls.push(a); return reply(); },
}));
const { AttendanceDrawer } = await import('./AttendanceDrawer');
const { ApiError } = await import('../api');

const row: AttendanceRow = {
  id: 'a1', mssv: '24211TM2001', fullName: 'Trần An', email: null, faculty: { id: 'f1', name: 'Khoa CNTT' },
  checkinAt: '2026-11-02T01:00:00Z', checkoutAt: null, timeliness: 'ON_TIME', source: 'SELF', reviewStatus: 'PENDING',
  reviewNote: null, drlAwarded: null, confirmCode: 'ABCD2345', editCount: 1, distanceM: 12, deviceRef: '1a2b3c4d',
  voidedAt: null, voidReason: null, flags: [{ code: 'DUPLICATE_MSSV', detail: null }],
};

describe('AttendanceDrawer (A07)', () => {
  beforeEach(() => { calls.length = 0; });

  it('hien thong tin ngay, roi lich su sua va su kien khac cua MSSV', async () => {
    const body = {
      attendance: row,
      edits: [
        { at: '2026-11-02T02:00:00Z', actorType: 'ADMIN', actorName: 'Cô Lan', reason: 'Chọn nhầm khoa', changes: [{ field: 'facultyUnitId', from: 'Khoa CNTT', to: 'Khoa Kinh tế' }] },
        { at: '2026-11-02T01:30:00Z', actorType: 'STUDENT', actorName: null, reason: null, changes: [{ field: 'reviewStatus', from: 'PENDING', to: 'APPROVED' }] },
      ],
      otherAttendances: [
        { attendanceId: 'b1', eventId: 'e2', eventTitle: 'Ngày hội việc làm', eventStartAt: '2026-10-01T01:00:00Z', checkinAt: '2026-10-01T01:00:00Z', mssv: '24211TM2009', reviewStatus: 'APPROVED', voided: false, drlAwarded: 3 },
      ],
    };
    reply = async () => body;
    render(<MemoryRouter><AttendanceDrawer row={row} onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('dialog', { name: /Trần An/ })).toBeInTheDocument();
    expect(screen.getByText('ABCD2345')).toBeInTheDocument();
    expect(await screen.findByText('Lịch sử sửa (2)')).toBeInTheDocument();
    expect(calls).toEqual([['GET', '/admin/attendances/a1']]);
    expect(screen.getByText(/Cô Lan/)).toBeInTheDocument();
    expect(screen.getByText('Khoa Kinh tế')).toBeInTheDocument();
    expect(screen.getByText('Sinh viên tự sửa', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Đã duyệt', { selector: 'b' })).toBeInTheDocument(); // trang thai doi sang nhan tieng Viet
    expect(screen.getByRole('link', { name: 'Ngày hội việc làm' })).toHaveAttribute('href', '/su-kien/e2/duyet');
    expect(screen.getByText('MSSV gộp: 24211TM2009')).toBeInTheDocument();
  });

  it('loi tu API hien thong bao; Esc va nut Dong goi onClose', async () => {
    const user = userEvent.setup();
    const err = new ApiError(404, 'NOT_FOUND', 'Không tìm thấy lượt điểm danh.');
    reply = async () => { throw err; };
    const onClose = vi.fn();
    render(<MemoryRouter><AttendanceDrawer row={row} onClose={onClose} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy lượt điểm danh.');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
