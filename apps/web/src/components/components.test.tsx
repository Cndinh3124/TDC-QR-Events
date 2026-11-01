import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { geoError } from './GeoFields';
import { Pagination } from './Pagination';
import { ReasonDialog } from './ReasonDialog';

describe('ReasonDialog', () => {
  it('nut gui bi khoa cho den khi nhap du ly do (>= 3 ky tu)', async () => {
    const user = userEvent.setup();
    render(<ReasonDialog title="Luu tru" confirmText="Luu tru" onClose={() => {}} onSubmit={async () => {}} />);
    const btn = screen.getByRole('button', { name: 'Luu tru' });
    expect(btn).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'ab');
    expect(btn).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'c');
    expect(btn).toBeEnabled();
  });

  it('thao tac nhieu du lieu: phai go lai dung ten moi bam duoc', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(<ReasonDialog title="Huy" confirmText="Huy su kien" danger confirmText2="Hoi thao A" onClose={() => {}} onSubmit={onSubmit} />);
    const [typed, reason] = screen.getAllByRole('textbox');
    await user.type(reason, 'Khong to chuc nua');
    const btn = screen.getByRole('button', { name: 'Huy su kien' });
    expect(btn).toBeDisabled(); // chua go ten
    await user.type(typed, 'Hoi thao');
    expect(btn).toBeDisabled(); // go thieu
    await user.type(typed, ' A');
    expect(btn).toBeEnabled();
    await user.click(btn);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Khong to chuc nua'));
  });

  it('hien thong bao loi tu API va khong dong hop thoai', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api');
    const onClose = vi.fn();
    render(<ReasonDialog title="Xoa" confirmText="Xoa" onClose={onClose} onSubmit={async () => { throw new ApiError(409, 'EVENT_IN_USE', 'Sự kiện đã có lượt điểm danh.'); }} />);
    await user.type(screen.getByRole('textbox'), 'xoa thu');
    await user.click(screen.getByRole('button', { name: 'Xoa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sự kiện đã có lượt điểm danh.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Pagination', () => {
  it('an khi chi co mot trang', () => {
    const { container } = render(<Pagination page={1} total={10} limit={20} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('chuyen trang va khoa nut o hai dau', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    render(<Pagination page={1} total={45} limit={20} onPage={onPage} />);
    expect(screen.getByText(/Trang 1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trước/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Sau/ }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});

describe('geoError (vi tri GPS: du ca ba hoac de trong ca ba)', () => {
  it('chap nhan trong ca ba va du ca ba, bao loi khi thieu', () => {
    expect(geoError({ latitude: '', longitude: '', radiusM: '' })).toBe('');
    expect(geoError({ latitude: '10.8', longitude: '106.7', radiusM: '100' })).toBe('');
    expect(geoError({ latitude: '10.8', longitude: '', radiusM: '' })).not.toBe('');
    expect(geoError({ latitude: '10.8', longitude: '106.7', radiusM: '' })).not.toBe('');
  });
});
