// Form tao su kien (POST /admin/events). Gio nhap theo gio may, gui di dang ISO 8601 co mui gio.
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, EventItem, Page, Unit } from '../api';
import { useAuth } from '../auth';
import { emptyGeo, Geo, GeoFields, geoError, geoPayload } from '../components/GeoFields';
import { toIso } from '../format';

export function EventForm() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [units, setUnits] = useState<Unit[]>([]);
  const [f, setF] = useState({
    unitId: '', title: '', description: '', locationName: '', startAt: '', endAt: '',
    hasDrl: false, drlPoints: '3', controlLevel: 'NORMAL', requireCheckout: false,
  });
  const [geo, setGeo] = useState<Geo>(emptyGeo);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSchool = user?.role === 'SCHOOL_ADMIN';

  // QTV truong chon don vi (de trong = su kien cap truong); quan ly khoa dung don vi cua minh
  useEffect(() => {
    if (isSchool) api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setUnits(p.items)).catch(() => {});
  }, [isSchool]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const gErr = geoError(geo);
    if (gErr) return setError(gErr);
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        title: f.title,
        startAt: toIso(f.startAt),
        endAt: toIso(f.endAt),
        hasDrl: f.hasDrl,
        controlLevel: f.controlLevel,
        requireCheckout: f.requireCheckout,
      };
      if (f.unitId) body.unitId = f.unitId;
      if (f.description) body.description = f.description;
      if (f.locationName) body.locationName = f.locationName;
      const g = geoPayload(geo);
      if (g.latitude !== null) Object.assign(body, g);
      if (f.hasDrl) body.drlPoints = Number(f.drlPoints);
      const res = await api<EventItem & { verifyCode: string | null }>('POST', '/admin/events', body);
      // ma 4 so chi hien mot lan (DB chi luu hash) nen chuyen sang man chi tiet de QTV ghi lai
      nav(`/su-kien/${res.id}`, { state: { verifyCode: res.verifyCode } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Thêm sự kiện</h1>
      <p className="sub">Sự kiện mới ở trạng thái Nháp; công bố sau khi kiểm tra lại thông tin.</p>
      <form className="card" onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        {isSchool && (
          <label className="field">
            <span>Đơn vị tổ chức</span>
            <select value={f.unitId} onChange={(e) => set('unitId', e.target.value)}>
              <option value="">Cấp trường (Đoàn trường)</option>
              {units.filter((u) => u.type === 'FACULTY').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Tên sự kiện *</span>
          <input required minLength={3} maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="field">
          <span>Mô tả</span>
          <textarea rows={3} maxLength={2000} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <label className="field">
          <span>Địa điểm</span>
          <input maxLength={200} value={f.locationName} onChange={(e) => set('locationName', e.target.value)} />
        </label>
        <GeoFields value={geo} onChange={setGeo} />
        <div className="grid2">
          <label className="field">
            <span>Bắt đầu *</span>
            <input type="datetime-local" required value={f.startAt} onChange={(e) => set('startAt', e.target.value)} />
          </label>
          <label className="field">
            <span>Kết thúc *</span>
            <input type="datetime-local" required value={f.endAt} onChange={(e) => set('endAt', e.target.value)} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.hasDrl} onChange={(e) => set('hasDrl', e.target.checked)} />
          Sự kiện có cộng điểm rèn luyện
        </label>
        {f.hasDrl && (
          <label className="field">
            <span>Điểm rèn luyện (1–10)</span>
            <input type="number" min={1} max={10} required value={f.drlPoints} onChange={(e) => set('drlPoints', e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Mức kiểm soát</span>
          <select value={f.controlLevel} onChange={(e) => set('controlLevel', e.target.value)}>
            <option value="NORMAL">Thường</option>
            <option value="TIGHT">Chặt (có mã xác nhận 4 số)</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={f.requireCheckout} onChange={(e) => set('requireCheckout', e.target.checked)} />
          Yêu cầu điểm danh ra
        </label>
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Tạo sự kiện'}</button>
          <Link to="/su-kien" className="btn">Hủy</Link>
        </div>
      </form>
    </div>
  );
}
