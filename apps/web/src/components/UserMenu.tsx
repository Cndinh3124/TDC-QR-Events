// Menu tai khoan o thanh tren: ten, chuc vu, don vi, email; doi mat khau va dang xuat.
// Tu dong khi bam ra ngoai, bam Esc hoac doi man.
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { User } from '../api';
import { ROLE_LABEL } from '../format';

interface Props {
  user: User;
  unitName: string | null; // null = chua tai xong hoac khong lay duoc: an dong don vi
  onSignOut: () => void;
}

// chu cai dau cua ho va ten (hoac chu dau neu chi co mot tu) de ve anh dai dien
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return (first + last).toLocaleUpperCase('vi');
}

export function UserMenu({ user, unitName, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const role = ROLE_LABEL[user.role] ?? user.role;

  return (
    <div className="user-menu" ref={box}>
      <button type="button" className="user-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="avatar" aria-hidden="true">{initials(user.fullName)}</span>
        <span className="user-short">
          <strong>{user.fullName}</strong>
          <small>{role}</small>
        </span>
        <span className="chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="user-panel" role="group" aria-label="Thông tin tài khoản">
          <div className="user-info">
            <span className="avatar big" aria-hidden="true">{initials(user.fullName)}</span>
            <div>
              <div className="user-name">{user.fullName}</div>
              <span className="role-pill">{role}</span>
            </div>
          </div>
          <dl className="user-kv">
            {unitName && (
              <>
                <dt>Đơn vị</dt>
                <dd>{unitName}</dd>
              </>
            )}
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </dl>
          <div className="user-actions">
            <Link to="/doi-mat-khau">Đổi mật khẩu</Link>
            <button type="button" className="danger" onClick={onSignOut}>Đăng xuất</button>
          </div>
        </div>
      )}
    </div>
  );
}
