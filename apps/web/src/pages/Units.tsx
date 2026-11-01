// Quan ly don vi (Doan truong + cac khoa): them, sua, ngung / kich hoat, xoa khi chua co du lieu - dac ta 2.1, 3.7
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, Page, Unit } from '../api';
import { Dialog } from '../components/Dialog';
import { ReasonDialog } from '../components/ReasonDialog';

type Action = { kind: 'edit'; unit: Unit | null } | { kind: 'deactivate' | 'activate' | 'remove'; unit: Unit };

export function Units() {
  const [items, setItems] = useState<Unit[] | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems((await api<Page<Unit>>('GET', '/admin/units?limit=100')).items);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được danh sách.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = () => { setAction(null); load(); };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1>Đơn vị</h1><p className="sub">Đơn vị đã có dữ liệu thì chỉ ngừng hoạt động được, không xóa. Đơn vị ngừng hoạt động không hiện trong form điểm danh.</p></div>
        <button className="btn primary" onClick={() => setAction({ kind: 'edit', unit: null })}>+ Thêm khoa</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card tablewrap">
        {!items && !error && <p>Đang tải…</p>}
        {items && (
          <table>
            <thead><tr><th>Tên</th><th>Mã</th><th>Loại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{items.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td><td className="mono">{u.code}</td><td>{u.type === 'SCHOOL' ? 'Đoàn trường' : 'Khoa'}</td>
                <td>{u.isActive === false ? <span className="badge err">Ngừng hoạt động</span> : <span className="badge ok">Hoạt động</span>}</td>
                <td className="row" style={{ gap: 12 }}>
                  <button className="link" onClick={() => setAction({ kind: 'edit', unit: u })}>Sửa</button>
                  {u.type === 'FACULTY' && (
                    <>
                      <button className="link" onClick={() => setAction({ kind: u.isActive === false ? 'activate' : 'deactivate', unit: u })}>{u.isActive === false ? 'Kích hoạt lại' : 'Ngừng hoạt động'}</button>
                      <button className="link danger" onClick={() => setAction({ kind: 'remove', unit: u })}>Xóa</button>
                    </>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {action?.kind === 'edit' && <UnitForm unit={action.unit} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'deactivate' && (
        <ReasonDialog title={`Ngừng hoạt động ${action.unit.name}`} confirmText="Ngừng hoạt động" danger onClose={() => setAction(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/units/${action.unit.id}/deactivate`, { reason }); done(); }} />
      )}
      {action?.kind === 'activate' && (
        <ReasonDialog title={`Kích hoạt lại ${action.unit.name}`} confirmText="Kích hoạt" onClose={() => setAction(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/units/${action.unit.id}/activate`, { reason }); done(); }} />
      )}
      {action?.kind === 'remove' && (
        <ReasonDialog title={`Xóa ${action.unit.name}`} confirmText="Xóa" danger onClose={() => setAction(null)}
          extra={<p className="sub">Chỉ xóa được khi chưa có tài khoản, sự kiện hay sinh viên thuộc khoa này.</p>}
          onSubmit={async (reason) => { await api('DELETE', `/admin/units/${action.unit.id}`, { reason }); done(); }} />
      )}
    </>
  );
}

function UnitForm({ unit, onClose, onDone }: { unit: Unit | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(unit?.name ?? '');
  const [code, setCode] = useState(unit?.code ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { name: name.trim(), code: code.trim().toUpperCase() };
      if (unit) await api('PATCH', `/admin/units/${unit.id}`, body);
      else await api('POST', '/admin/units', body);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công.');
      setBusy(false);
    }
  }
  return (
    <Dialog title={unit ? 'Sửa đơn vị' : 'Thêm khoa'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        <label className="field"><span>Tên *</span><input required minLength={2} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Mã * (2–20 ký tự chữ hoa, số, gạch dưới)</span>
          <input required pattern="[A-Za-z0-9_]{2,20}" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </form>
    </Dialog>
  );
}
