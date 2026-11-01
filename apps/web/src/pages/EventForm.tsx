// Form tao / sua su kien (POST / PATCH /admin/events). Gio nhap theo gio may, gui di dang ISO 8601 co mui gio.
// Sua: chi gui cac truong that su doi; su kien da mo diem danh thi sua gio, vi tri, DRL... phai kem ly do (dac ta 3.7).
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, EventItem, Page, Unit } from '../api';
import { useAuth } from '../auth';
import { emptyGeo, Geo, GeoFields, geoError, geoPayload } from '../components/GeoFields';
import { toIso, toLocalInput } from '../format';

interface FormState {
  unitId: string; title: string; description: string; locationName: string; startAt: string; endAt: string;
  checkinOpenAt: string; checkinCloseAt: string; graceMinutes: string;
  hasDrl: boolean; drlPoints: string; controlLevel: string; requireCheckout: boolean;
}

const BLANK: FormState = {
  unitId: '', title: '', description: '', locationName: '', startAt: '', endAt: '',
  checkinOpenAt: '', checkinCloseAt: '', graceMinutes: '',
  hasDrl: false, drlPoints: '3', controlLevel: 'NORMAL', requireCheckout: false,
};

const toForm = (e: EventItem): FormState => ({
  unitId: e.unit?.id ?? '', title: e.title, description: e.description ?? '', locationName: e.locationName ?? '',
  startAt: toLocalInput(e.startAt), endAt: toLocalInput(e.endAt),
  checkinOpenAt: toLocalInput(e.checkinOpenAt), checkinCloseAt: toLocalInput(e.checkinCloseAt),
  graceMinutes: String(e.graceMinutes), hasDrl: e.hasDrl, drlPoints: String(e.drlPoints ?? 3),
  controlLevel: e.controlLevel, requireCheckout: e.requireCheckout,
});

const toGeo = (e: EventItem): Geo =>
  e.latitude === null ? emptyGeo : { latitude: String(e.latitude), longitude: String(e.longitude), radiusM: String(e.radiusM) };

const sameTime = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

export function EventForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { user } = useAuth();
  const nav = useNavigate();
  const [units, setUnits] = useState<Unit[]>([]);
  const [orig, setOrig] = useState<EventItem | null>(null);
  const [f, setF] = useState<FormState>(BLANK);
  const [geo, setGeo] = useState<Geo>(emptyGeo);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSchool = user?.role === 'SCHOOL_ADMIN';

  // QTV truong chon don vi (de trong = su kien cap truong); quan ly khoa dung don vi cua minh
  useEffect(() => {
    if (isSchool && !editing) api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setUnits(p.items)).catch(() => {});
  }, [isSchool, editing]);

  useEffect(() => {
    if (!id) return;
    api<EventItem>('GET', `/admin/events/${id}`)
      .then((e) => {
        setOrig(e);
        setF(toForm(e));
        setGeo(toGeo(e));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được sự kiện.'));
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  // [NV] 5.2: muc Chat bat buoc diem danh ra (QR ra + ma 4 so) nen tu bat va khoa o nay
  const forcedOut = f.controlLevel === 'TIGHT';
  const requireCheckout = forcedOut || f.requireCheckout;

  // bat dau diem danh roi thi sua nhay cam can ly do - khop dieu kien o API (hasCheckinStarted)
  const started = orig !== null && (['CHECKIN_OPEN', 'CHECKIN_CLOSED', 'REVIEWING', 'FINALIZED'].includes(orig.status)
    || (orig.status === 'PUBLISHED' && new Date() >= new Date(orig.checkinOpenAt)));

  function createBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      title: f.title, startAt: toIso(f.startAt), endAt: toIso(f.endAt),
      hasDrl: f.hasDrl, controlLevel: f.controlLevel, requireCheckout,
    };
    if (f.unitId) body.unitId = f.unitId;
    if (f.description) body.description = f.description;
    if (f.locationName) body.locationName = f.locationName;
    const g = geoPayload(geo);
    if (g.latitude !== null) Object.assign(body, g);
    if (f.hasDrl) body.drlPoints = Number(f.drlPoints);
    if (f.checkinOpenAt) body.checkinOpenAt = toIso(f.checkinOpenAt);
    if (f.checkinCloseAt) body.checkinCloseAt = toIso(f.checkinCloseAt);
    if (f.graceMinutes !== '') body.graceMinutes = Number(f.graceMinutes);
    return body;
  }

  // chi cac truong da doi so voi ban dang luu
  function patchBody(o: EventItem): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    if (f.title !== o.title) b.title = f.title;
    if (f.description !== (o.description ?? '')) b.description = f.description === '' ? null : f.description;
    if (f.locationName !== (o.locationName ?? '')) b.locationName = f.locationName === '' ? null : f.locationName;
    const og = toGeo(o);
    if (geo.latitude !== og.latitude || geo.longitude !== og.longitude || geo.radiusM !== og.radiusM) Object.assign(b, geoPayload(geo));
    if (!sameTime(toIso(f.startAt), o.startAt)) b.startAt = toIso(f.startAt);
    if (!sameTime(toIso(f.endAt), o.endAt)) b.endAt = toIso(f.endAt);
    if (f.checkinOpenAt && !sameTime(toIso(f.checkinOpenAt), o.checkinOpenAt)) b.checkinOpenAt = toIso(f.checkinOpenAt);
    if (f.checkinCloseAt && !sameTime(toIso(f.checkinCloseAt), o.checkinCloseAt)) b.checkinCloseAt = toIso(f.checkinCloseAt);
    if (f.graceMinutes !== '' && Number(f.graceMinutes) !== o.graceMinutes) b.graceMinutes = Number(f.graceMinutes);
    if (f.hasDrl !== o.hasDrl || (f.hasDrl && Number(f.drlPoints) !== o.drlPoints)) {
      b.hasDrl = f.hasDrl;
      b.drlPoints = f.hasDrl ? Number(f.drlPoints) : null;
    }
    if (f.controlLevel !== o.controlLevel) b.controlLevel = f.controlLevel;
    if (requireCheckout !== o.requireCheckout) b.requireCheckout = requireCheckout;
    return b;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const gErr = geoError(geo);
    if (gErr) return setError(gErr);
    setBusy(true);
    setError('');
    try {
      if (editing && orig) {
        const body = patchBody(orig);
        if (Object.keys(body).length === 0) return setError('Chưa có thay đổi nào để lưu.');
        if (reason.trim()) body.reason = reason.trim();
        await api('PATCH', `/admin/events/${orig.id}`, body);
        nav(`/su-kien/${orig.id}`);
      } else {
        const res = await api<EventItem & { verifyCode: string | null }>('POST', '/admin/events', createBody());
        // ma 4 so chi hien mot lan (DB chi luu hash) nen chuyen sang man chi tiet de QTV ghi lai
        nav(`/su-kien/${res.id}`, { state: { verifyCode: res.verifyCode } });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  }

  if (editing && !orig) return error ? <div className="error" role="alert">{error}</div> : <p>Đang tải…</p>;
  if (editing && orig && !orig.canManage) return <div className="error">Bạn chỉ được xem sự kiện này, không sửa được.</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <p className="sub">{editing && orig ? <Link to={`/su-kien/${orig.id}`}>← Quay lại sự kiện</Link> : <Link to="/su-kien">← Danh sách sự kiện</Link>}</p>
      <h1>{editing ? 'Sửa sự kiện' : 'Thêm sự kiện'}</h1>
      <p className="sub">{editing ? 'Chỉ những trường bạn đổi mới được lưu.' : 'Sự kiện mới ở trạng thái Nháp; công bố sau khi kiểm tra lại thông tin.'}</p>
      <form className="card" onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        {isSchool && !editing && (
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
        <details className="adv">
          <summary>Khung giờ điểm danh và ân hạn (tùy chọn)</summary>
          <p className="sub">Để trống: mở điểm danh trước giờ bắt đầu theo cấu hình hệ thống (mặc định 30 phút) và đóng lúc kết thúc.
            Đổi giờ bắt đầu không tự dời khung điểm danh.</p>
          <div className="grid2">
            <label className="field">
              <span>Mở điểm danh lúc</span>
              <input type="datetime-local" value={f.checkinOpenAt} onChange={(e) => set('checkinOpenAt', e.target.value)} />
            </label>
            <label className="field">
              <span>Đóng điểm danh lúc</span>
              <input type="datetime-local" value={f.checkinCloseAt} onChange={(e) => set('checkinCloseAt', e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Ân hạn “Đúng giờ” (phút sau giờ bắt đầu, 0–120)</span>
            <input type="number" min={0} max={120} placeholder="Mặc định theo cấu hình" value={f.graceMinutes} onChange={(e) => set('graceMinutes', e.target.value)} />
          </label>
        </details>
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
            <option value="NORMAL">Thường — QR điểm danh vào, hệ thống gắn cờ lượt bất thường</option>
            <option value="TIGHT">Chặt — thêm QR điểm danh ra và mã 4 số đọc tại chỗ</option>
          </select>
          {!editing && f.hasDrl && Number(f.drlPoints) >= 5 && f.controlLevel === 'NORMAL' && (
            <small className="hint">Sự kiện từ 5 điểm trở lên nên dùng mức Chặt.</small>
          )}
        </label>
        <label className="check">
          <input type="checkbox" checked={requireCheckout} disabled={forcedOut} onChange={(e) => set('requireCheckout', e.target.checked)} />
          Yêu cầu điểm danh ra{forcedOut && ' (bắt buộc với mức Chặt)'}
        </label>
        {editing && orig && orig.status !== 'DRAFT' && (
          <label className="field">
            <span>Lý do thay đổi{started ? ' *' : ''}</span>
            <input maxLength={500} required={started} value={reason} onChange={(e) => setReason(e.target.value)} />
            {started && <small className="hint">Sự kiện đã mở điểm danh: đổi giờ, vị trí, điểm, ân hạn, mức kiểm soát hoặc điểm danh ra đều phải ghi lý do.</small>}
          </label>
        )}
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo sự kiện'}</button>
          <Link to={editing && orig ? `/su-kien/${orig.id}` : '/su-kien'} className="btn">Hủy</Link>
        </div>
      </form>
    </div>
  );
}
