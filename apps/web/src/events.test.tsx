import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: unknown[][] = [];
let onDelete: () => Promise<unknown> = async () => undefined;
const item = (o: Record<string, unknown>) => ({
  id: 'e1', title: 'Hội thảo AI', unit: null, startAt: '2026-11-05T01:00:00Z', hasDrl: false, drlPoints: null,
  status: 'DRAFT', checkinState: 'NOT_AVAILABLE', archivedAt: null, canManage: true, ...o,
});
let rows = [item({}), item({ id: 'e2', title: 'Đã chốt', status: 'FINALIZED' }), item({ id: 'e3', title: 'Được chia sẻ', canManage: false })];
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  api: (...a: unknown[]) => {
    calls.push(a);
    if (a[0] === 'DELETE') return onDelete();
    return Promise.resolve({ items: rows, total: rows.length, page: 1, limit: 20 });
  },
}));
vi.mock('./auth', () => ({ useAuth: () => ({ user: { role: 'FACULTY_MANAGER' } }) }));
const { Events } = await import('./pages/Events');
const { ApiError } = await import('./api');

describe('Danh sach su kien - nut Xoa', () => {
  beforeEach(() => { calls.length = 0; onDelete = async () => undefined; });

  it('chi hien voi su kien minh quan ly va chua chot; xoa phai go lai ten + ly do, xong tai lai danh sach', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Events /></MemoryRouter>);
    const btns = await screen.findAllByRole('button', { name: /^Xóa sự kiện/ });
    expect(btns.map((b) => b.getAttribute('aria-label'))).toEqual(['Xóa sự kiện Hội thảo AI']);
    await user.click(btns[0]);
    const [typed, reason] = screen.getAllByRole('textbox');
    await user.type(reason, 'Tạo nhầm');
    const ok = screen.getByRole('button', { name: 'Xóa hẳn' });
    expect(ok).toBeDisabled();
    await user.type(typed, 'Hội thảo AI');
    rows = rows.slice(1);
    await user.click(ok);
    await waitFor(() => expect(calls).toContainEqual(['DELETE', '/admin/events/e1', { reason: 'Tạo nhầm' }]));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã xóa sự kiện "Hội thảo AI".');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Hội thảo AI' })).toBeNull());
  });

  it('API tu choi (da co luot diem danh): hien loi trong hop thoai, khong dong', async () => {
    const user = userEvent.setup();
    rows = [item({})];
    onDelete = async () => { throw new ApiError(409, 'EVENT_IN_USE', 'Sự kiện đã có lượt điểm danh, hãy dùng "Hủy sự kiện" hoặc "Lưu trữ".'); };
    render(<MemoryRouter><Events /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Xóa sự kiện Hội thảo AI' }));
    const [typed, reason] = screen.getAllByRole('textbox');
    await user.type(typed, 'Hội thảo AI');
    await user.type(reason, 'Tạo nhầm');
    await user.click(screen.getByRole('button', { name: 'Xóa hẳn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('đã có lượt điểm danh');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
