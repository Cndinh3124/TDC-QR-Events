// Doi mat khau (bat buoc o lan dang nhap dau)
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, changePassword } from '../api';
import { useAuth } from '../auth';

export function ChangePassword() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== again) return setError('Mật khẩu mới nhập lại chưa khớp.');
    setBusy(true);
    setError('');
    try {
      setUser(await changePassword(current, next));
      nav('/tong-quan', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 440 }}>
      <h1>Đổi mật khẩu</h1>
      <p className="sub">Ít nhất 10 ký tự, không chứa phần tên trong email.</p>
      {user?.mustChangePassword && <div className="notice">Đây là lần đăng nhập đầu, bạn cần đặt mật khẩu mới để tiếp tục.</div>}
      <form className="card" onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        <label className="field">
          <span>Mật khẩu hiện tại</span>
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span>Mật khẩu mới</span>
          <input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="field">
          <span>Nhập lại mật khẩu mới</span>
          <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Đổi mật khẩu'}</button>
      </form>
    </div>
  );
}
