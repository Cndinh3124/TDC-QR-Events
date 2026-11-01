// Quan ly tai khoan quan tri (chi Doan truong): them, sua, khoa / mo khoa, dat lai mat khau, xoa - dac ta 3.7, 7
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, Page, qs, Unit, UserItem } from '../api';
import { Dialog } from '../components/Dialog';
import { ReasonDialog } from '../components/ReasonDialog';
import { fmt, ROLE_LABEL } from '../format';

type Action =
  | { kind: 'edit'; user: UserItem | null }
  | { kind: 'lock' | 'unlock' | 'remove' | 'reset'; user: UserItem };

const LIMIT = 20;

export function Users() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'locked'>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<UserItem> | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api<Page<UserItem>>('GET', `/admin/users${qs({ q: q.trim(), status, page, limit: LIMIT })}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được danh sách.');
    }
  }, [q, status, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setUnits(p.items)).catch(() => {}); }, []);

  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? '—';
  const done = () => { setAction(null); load(); };
  const locked = (u: UserItem) => !u.isActive;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1>Tài khoản quản trị</h1><p className="sub">Tài khoản mới phải đổi mật khẩu ở lần đăng nhập đầu. Khóa tài khoản sẽ đăng xuất ngay mọi phiên.</p></div>
        <button className="btn primary" onClick={() => setAction({ kind: 'edit', user: null })}>+ Thêm tài khoản</button>
      </div>
      <div className="toolbar">
        <input placeholder="Tìm theo email hoặc họ tên" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
          <option value="">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="locked">Đã khóa</option>
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card tablewrap">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && <p className="sub" style={{ margin: 0 }}>Không có tài khoản nào.</p>}
        {data && data.items.length > 0 && (
          <table>
            <thead><tr><th>Họ tên / email</th><th>Vai trò</th><th>Đơn vị</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{data.items.map((u) => (
              <tr key={u.id}>
                <td><b>{u.fullName}</b><br /><span className="mono">{u.email}</span></td>
                <td>{ROLE_LABEL[u.role]}</td><td>{unitName(u.unitId)}</td>
                <td>{u.lastLoginAt ? fmt(u.lastLoginAt) : 'Chưa đăng nhập'}</td>
                <td>
                  {locked(u) ? <span className="badge err">Đã khóa</span> : <span className="badge ok">Hoạt động</span>}
                  {u.mustChangePassword && <> <span className="badge wait">Chờ đổi mật khẩu</span></>}
                </td>
                <td className="row" style={{ gap: 12 }}>
                  <button className="link" onClick={() => setAction({ kind: 'edit', user: u })}>Sửa</button>
                  <button className="link" onClick={() => setAction({ kind: locked(u) ? 'unlock' : 'lock', user: u })}>{locked(u) ? 'Mở khóa' : 'Khóa'}</button>
                  <button className="link" onClick={() => setAction({ kind: 'reset', user: u })}>Đặt lại mật khẩu</button>
                  <button className="link danger" onClick={() => setAction({ kind: 'remove', user: u })}>Xóa</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {data && data.total > LIMIT && (
          <div className="pager">
            <span>Trang {data.page} / {Math.ceil(data.total / LIMIT)}</span>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
            <button className="btn" disabled={page * LIMIT >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
          </div>
        )}
      </div>

      {action?.kind === 'edit' && <UserForm user={action.user} units={units} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'lock' && (
        <ReasonDialog title={`Khóa tài khoản ${action.user.email}`} confirmText="Khóa" danger onClose={() => setAction(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/users/${action.user.id}/lock`, { reason }); done(); }} />
      )}
      {action?.kind === 'unlock' && (
        <ReasonDialog title={`Mở khóa tài khoản ${action.user.email}`} confirmText="Mở khóa" onClose={() => setAction(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/users/${action.user.id}/unlock`, { reason }); done(); }} />
      )}
      {action?.kind === 'remove' && (
        <ReasonDialog title={`Xóa tài khoản ${action.user.email}`} confirmText="Xóa" danger onClose={() => setAction(null)}
          extra={<p className="sub">Chỉ xóa được tài khoản chưa có dữ liệu liên quan. Nếu đã có, hãy chọn Khóa.</p>}
          onSubmit={async (reason) => { await api('DELETE', `/admin/users/${action.user.id}`, { reason }); done(); }} />
      )}
      {action?.kind === 'reset' && <ResetDialog user={action.user} onClose={() => setAction(null)} onDone={done} />}
    </>
  );
}

function UserForm({ user, units, onClose, onDone }: { user: UserItem | null; units: Unit[]; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState(user?.email ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [role, setRole] = useState<UserItem['role']>(user?.role ?? 'FACULTY_MANAGER');
  const [unitId, setUnitId] = useState(user?.unitId ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // vai tro quyet dinh loai don vi: Doan truong <-> don vi Doan truong, quan ly khoa <-> khoa
  const choices = units.filter((u) => u.isActive !== false && (role === 'SCHOOL_ADMIN' ? u.type === 'SCHOOL' : u.type === 'FACULTY'));
  useEffect(() => {
    if (!choices.some((u) => u.id === unitId)) setUnitId(choices[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, units]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (user) await api('PATCH', `/admin/users/${user.id}`, { fullName: fullName.trim(), role, unitId });
      else await api('POST', '/admin/users', { email: email.trim(), fullName: fullName.trim(), role, unitId, password });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={user ? 'Sửa tài khoản' : 'Thêm tài khoản'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        <label className="field"><span>Email *</span><input type="email" required disabled={!!user} maxLength={190} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Họ tên *</span><input required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
        <div className="grid2">
          <label className="field"><span>Vai trò *</span>
            <select value={role} onChange={(e) => setRole(e.target.value as UserItem['role'])}>
              <option value="FACULTY_MANAGER">{ROLE_LABEL.FACULTY_MANAGER}</option><option value="SCHOOL_ADMIN">{ROLE_LABEL.SCHOOL_ADMIN}</option>
            </select></label>
          <label className="field"><span>Đơn vị *</span>
            <select required value={unitId} onChange={(e) => setUnitId(e.target.value)}>{choices.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        </div>
        {!user && (
          <label className="field"><span>Mật khẩu ban đầu * (ít nhất 10 ký tự; người dùng phải đổi ở lần đăng nhập đầu)</span>
            <input type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy || !unitId}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function ResetDialog({ user, onClose, onDone }: { user: UserItem; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('POST', `/admin/users/${user.id}/reset-password`, { newPassword: password });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công.');
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Đặt lại mật khẩu cho ${user.email}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        <p className="sub">Mọi phiên đăng nhập của tài khoản này bị đăng xuất, và người dùng phải đổi mật khẩu ở lần đăng nhập tới. Hãy gửi mật khẩu tạm qua kênh riêng, đừng gửi chung với email.</p>
        <label className="field"><span>Mật khẩu tạm * (ít nhất 10 ký tự)</span>
          <input type="password" required minLength={10} maxLength={128} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Đặt lại'}</button>
        </div>
      </form>
    </Dialog>
  );
}
