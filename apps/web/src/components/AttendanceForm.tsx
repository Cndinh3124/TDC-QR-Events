// Form them thu cong / sua luot diem danh (bat buoc ly do) - dac ta 3.7
import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, AttendanceRow, Page, Unit } from '../api';
import { toIso, toLocalInput } from '../format';
import { Dialog } from './Dialog';

interface Props {
  eventId: string;
  requireCheckout: boolean;
  // co = dang sua; khong = them moi
  row?: AttendanceRow;
  // dien san (khi tao tu khieu nai)
  preset?: { mssv: string; fullName: string; facultyUnitId: string };
  onClose: () => void;
  onDone: () => void;
  // tuy chinh viec gui: mac dinh goi API them / sua luot
  submit?: (fields: Record<string, unknown>, reason: string) => Promise<void>;
  title?: string;
  askReason?: boolean;
}

export function AttendanceForm(p: Props) {
  const r = p.row;
  const [faculties, setFaculties] = useState<Unit[]>([]);
  const [f, setF] = useState({
    mssv: r?.mssv ?? p.preset?.mssv ?? '', fullName: r?.fullName ?? p.preset?.fullName ?? '',
    facultyUnitId: r?.faculty?.id ?? p.preset?.facultyUnitId ?? '', email: r?.email ?? '',
    checkinAt: toLocalInput(r?.checkinAt ?? null), checkoutAt: toLocalInput(r?.checkoutAt ?? null), reason: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const askReason = p.askReason ?? true;

  useEffect(() => {
    api<Page<Unit>>('GET', '/admin/units?limit=100').then((x) => setFaculties(x.items.filter((u) => u.type === 'FACULTY'))).catch(() => {});
  }, []);

  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (!r || f.mssv.trim().toUpperCase() !== r.mssv) body.mssv = f.mssv.trim();
      if (!r || f.fullName !== r.fullName) body.fullName = f.fullName;
      if (!r || f.facultyUnitId !== r.faculty?.id) body.facultyUnitId = f.facultyUnitId;
      if (!r ? f.email.trim() : f.email.trim() !== (r.email ?? '')) body.email = f.email.trim() || (r ? null : undefined);
      if (f.checkinAt && (!r || f.checkinAt !== toLocalInput(r.checkinAt))) body.checkinAt = toIso(f.checkinAt);
      if (f.checkoutAt !== (r ? toLocalInput(r.checkoutAt) : '')) body.checkoutAt = f.checkoutAt ? toIso(f.checkoutAt) : null;
      if (p.submit) await p.submit(body, f.reason.trim());
      else if (r) await api('PATCH', `/admin/attendances/${r.id}`, { ...body, reason: f.reason.trim() });
      else await api('POST', `/admin/events/${p.eventId}/attendances`, { ...stripNull(body), reason: f.reason.trim() });
      p.onDone();
      p.onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={p.title ?? (r ? 'Sửa lượt điểm danh' : 'Thêm lượt điểm danh thủ công')} onClose={p.onClose}>
      <form onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="grid2">
          <label className="field"><span>MSSV *</span>
            <input className="mono" required maxLength={20} value={f.mssv} onChange={(e) => set('mssv', e.target.value)} /></label>
          <label className="field"><span>Họ tên *</span>
            <input required minLength={2} maxLength={100} value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></label>
        </div>
        <label className="field"><span>Khoa *</span>
          <select required value={f.facultyUnitId} onChange={(e) => set('facultyUnitId', e.target.value)}>
            <option value="">Chọn khoa</option>
            {faculties.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></label>
        <label className="field"><span>Email</span>
          <input type="email" maxLength={150} value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
        <div className="grid2">
          <label className="field"><span>Giờ vào {r ? '' : '(bỏ trống = giờ bắt đầu)'}</span>
            <input type="datetime-local" value={f.checkinAt} onChange={(e) => set('checkinAt', e.target.value)} /></label>
          {p.requireCheckout && (
            <label className="field"><span>Giờ ra</span>
              <input type="datetime-local" value={f.checkoutAt} onChange={(e) => set('checkoutAt', e.target.value)} /></label>
          )}
        </div>
        {askReason && (
          <label className="field"><span>Lý do *</span>
            <textarea rows={2} required minLength={3} maxLength={500} value={f.reason} onChange={(e) => set('reason', e.target.value)} /></label>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={p.onClose}>Hủy</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </form>
    </Dialog>
  );
}

// API them moi khong nhan null (chi sua moi nhan null de xoa)
function stripNull(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}
