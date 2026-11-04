import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../api';
import { initials, UserMenu } from './UserMenu';

const admin: User = {
  id: '1',
  email: 'nguyencongdinh@tdc.edu.vn',
  fullName: 'Nguyễn Công Đình',
  role: 'SCHOOL_ADMIN',
  unitId: 'u1',
  mustChangePassword: false,
};

function setup(over: Partial<{ user: User; unitName: string | null; onSignOut: () => void }> = {}) {
  const onSignOut = over.onSignOut ?? vi.fn();
  render(
    <MemoryRouter>
      <UserMenu user={over.user ?? admin} unitName={over.unitName === undefined ? 'Đoàn trường' : over.unitName} onSignOut={onSignOut} />
      <p>ben ngoai</p>
    </MemoryRouter>,
  );
  return { onSignOut, trigger: screen.getByRole('button', { name: /Nguyễn Công Đình/ }) };
}

describe('initials', () => {
  it('lay chu dau cua ho va ten, in hoa, giu dau tieng Viet', () => {
    expect(initials('Nguyễn Công Đình')).toBe('NĐ');
    expect(initials('đặng thu hà')).toBe('ĐH');
  });
  it('mot tu thi lay chu dau; rong thi tra ?', () => {
    expect(initials('nguyencongdinh')).toBe('N');
    expect(initials('   ')).toBe('?');
  });
});

describe('UserMenu', () => {
  it('dong mac dinh, chi hien ten va chuc vu tren nut', () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Quản trị Đoàn trường');
    expect(screen.queryByText('nguyencongdinh@tdc.edu.vn')).not.toBeInTheDocument();
  });

  it('mo ra thi hien chuc vu, don vi, email, doi mat khau va dang xuat', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('nguyencongdinh@tdc.edu.vn')).toBeInTheDocument();
    expect(screen.getByText('Đơn vị')).toBeInTheDocument();
    expect(screen.getByText('Đoàn trường')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đổi mật khẩu' })).toHaveAttribute('href', '/doi-mat-khau');
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('quan ly khoa: hien dung chuc vu theo vai tro', async () => {
    const user = userEvent.setup();
    const { trigger } = setup({ user: { ...admin, role: 'FACULTY_MANAGER' }, unitName: 'Khoa Công nghệ thông tin' });
    await user.click(trigger);
    expect(screen.getAllByText('Quản lý khoa').length).toBeGreaterThan(0);
    expect(screen.getByText('Khoa Công nghệ thông tin')).toBeInTheDocument();
  });

  it('chua co ten don vi thi an dong Don vi, khong hien chu null', async () => {
    const user = userEvent.setup();
    const { trigger } = setup({ unitName: null });
    await user.click(trigger);
    expect(screen.queryByText('Đơn vị')).not.toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('bam Esc hoac bam ra ngoai thi dong', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await user.click(screen.getByText('ben ngoai'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('bam Dang xuat thi goi onSignOut', async () => {
    const user = userEvent.setup();
    const { onSignOut, trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
