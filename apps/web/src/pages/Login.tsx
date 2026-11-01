// Man dang nhap QTV (A01): bo cuc chia doi - trai nhan dien Doan/Hoi/TDC, phai la form.
import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, login } from '../api';
import { useAuth } from '../auth';
import { LogoTrio } from '../components/Brand';

export function Login() {
  const { user, loading, setUser } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/tong-quan" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setUser(await login(email, password));
      nav('/tong-quan', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-split">
      <section className="login-art">
        <div className="login-brand">
          <LogoTrio size={56} />
          <div>
            <b>TRƯỜNG CAO ĐẲNG CÔNG NGHỆ THỦ ĐỨC</b>
            <span>TDC – Luôn đổi mới để phát triển</span>
          </div>
        </div>
        <div className="login-slogan">
          <div className="kicker">ĐOÀN THANH NIÊN – HỘI SINH VIÊN</div>
          <div className="kicker">TUỔI TRẺ TRƯỜNG CAO ĐẲNG CÔNG NGHỆ THỦ ĐỨC</div>
          <h2>Sức trẻ tiên phong.<br />Khát vọng vươn mình.</h2>
          <p>Tiên phong đổi mới – Bản lĩnh hành động – Đồng hành phát triển.</p>
        </div>
        <div className="login-values">ĐOÀN KẾT • SÁNG TẠO • CỐNG HIẾN • TRƯỞNG THÀNH</div>
      </section>
      <section className="login-form-side">
        <form className="login-form" onSubmit={submit}>
          <h1>Đăng nhập</h1>
          <p className="sub">Dành cho cán bộ Đoàn – Hội trường và các khoa.</p>
          {error && <div className="error" role="alert">{error}</div>}
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" required placeholder="ten.canbo@tdc.edu.vn" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <div className="pw">
              <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="link" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Ẩn' : 'Hiện'}</button>
            </div>
          </label>
          <button className="btn primary" style={{ width: '100%', padding: '12px 16px' }} disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
          <p className="login-note">
            Tài khoản bị tạm khóa 15 phút sau 5 lần nhập sai. Tài khoản do Đoàn trường hoặc khoa cấp, không tự đăng ký.
            Quên mật khẩu: liên hệ quản trị Đoàn trường.
          </p>
        </form>
      </section>
    </div>
  );
}
