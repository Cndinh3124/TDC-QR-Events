// Tab "Chia se cho khoa": Doan truong cho cac khoa xem (chi doc) su kien cap truong - dac ta 2.4
import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, EventItem, FacultyViewMode, Page, Unit } from '../../api';

const MODES: Array<[FacultyViewMode, string, string]> = [
  ['NONE', 'Không chia sẻ', 'Chỉ Đoàn trường thấy sự kiện này (mặc định).'],
  ['ALL', 'Mọi khoa', 'Quản lý của mọi khoa xem được sự kiện và sinh viên khoa mình.'],
  ['SELECTED', 'Chỉ các khoa được chọn', 'Chỉ quản lý của những khoa bạn chọn bên dưới xem được.'],
];

export function SharePanel({ ev, onSaved }: { ev: EventItem; onSaved: () => void }) {
  const [mode, setMode] = useState<FacultyViewMode>(ev.facultyViewMode);
  const [picked, setPicked] = useState<string[]>(ev.facultyViewUnitIds ?? []);
  const [faculties, setFaculties] = useState<Unit[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setFaculties(p.items.filter((u) => u.type === 'FACULTY' && u.isActive !== false))).catch(() => {});
  }, []);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'SELECTED' && picked.length === 0) return setError('Hãy chọn ít nhất một khoa.');
    setBusy(true);
    setError('');
    setDone('');
    try {
      await api('POST', `/admin/events/${ev.id}/faculty-view`, { mode, unitIds: mode === 'SELECTED' ? picked : undefined, reason: reason.trim() });
      setReason('');
      setDone('Đã cập nhật quyền xem của các khoa.');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 720 }}>
      <h2>Chia sẻ sự kiện cho các khoa</h2>
      <p className="sub">Khoa được chia sẻ chỉ <b>xem</b>: không sửa, không đổi trạng thái, không lấy mã QR hay mã 4 số, không duyệt. Họ chỉ thấy lượt điểm danh của sinh viên khoa mình.</p>
      {error && <div className="error" role="alert">{error}</div>}
      {done && <div className="notice">{done}</div>}
      {MODES.map(([v, label, hint]) => (
        <label key={v} className="radio">
          <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} />
          <span><b>{label}</b><small className="hint">{hint}</small></span>
        </label>
      ))}
      {mode === 'SELECTED' && (
        <fieldset className="faculty-list">
          <legend>Chọn khoa ({picked.length}/{faculties.length})</legend>
          {faculties.map((u) => (
            <label key={u.id} className="check">
              <input type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} />
              {u.name}
            </label>
          ))}
        </fieldset>
      )}
      <label className="field">
        <span>Lý do thay đổi *</span>
        <input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
    </form>
  );
}
