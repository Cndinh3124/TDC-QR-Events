// Chi tiet su kien: thong tin, cong bo / mo / dong diem danh, so dem truc tiep (10 giay), ma QR vao / ra
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ApiError, Counters, EventItem, fetchBlobUrl, QrInfo } from '../api';
import { emptyGeo, Geo, GeoFields, geoError, geoPayload } from '../components/GeoFields';
import { fmt, StatusBadge } from '../format';

interface QrData {
  checkin: QrInfo | null;
  checkout: QrInfo | null;
  hasVerifyCode: boolean;
}

function QrImage({ eventId, purpose }: { eventId: string; purpose: 'CHECKIN' | 'CHECKOUT' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '';
    fetchBlobUrl(`/admin/events/${eventId}/qr.png?purpose=${purpose}`).then((u) => {
      url = u;
      setSrc(u);
    }).catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [eventId, purpose]);
  return src ? <img src={src} alt={`Mã QR điểm danh ${purpose === 'CHECKIN' ? 'vào' : 'ra'}`} /> : <p>Đang tải mã QR…</p>;
}

export function EventDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const verifyCode = (location.state as { verifyCode?: string | null } | null)?.verifyCode;
  const [ev, setEv] = useState<EventItem | null>(null);
  const [qr, setQr] = useState<QrData | null>(null);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [geo, setGeo] = useState<Geo>(emptyGeo);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    try {
      const e = await api<EventItem>('GET', `/admin/events/${id}`);
      setEv(e);
      setGeo(e.latitude === null ? emptyGeo : { latitude: String(e.latitude), longitude: String(e.longitude), radiusM: String(e.radiusM) });
      setQr(e.status === 'DRAFT' || e.status === 'CANCELLED' ? null : await api<QrData>('GET', `/admin/events/${id}/qr`).catch(() => null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được sự kiện.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // so dem truc tiep: polling 10 giay khi dang mo diem danh
  useEffect(() => {
    if (!ev || ev.checkinState !== 'OPEN') return;
    const tick = () => api<Counters>('GET', `/admin/events/${id}/counters`).then(setCounters).catch(() => {});
    tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, [ev, id]);

  async function act(action: 'publish' | 'open' | 'close') {
    setBusy(true);
    setError('');
    try {
      await api('POST', `/admin/events/${id}/${action}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công.');
    } finally {
      setBusy(false);
    }
  }

  // sua vi tri (PATCH): da mo diem danh thi API bat buoc co ly do - dac ta 3.7
  async function saveGeo() {
    const gErr = geoError(geo);
    if (gErr) return setError(gErr);
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const body: Record<string, unknown> = geoPayload(geo);
      if (reason.trim()) body.reason = reason.trim();
      await api('PATCH', `/admin/events/${id}`, body);
      setReason('');
      setSaved('Đã lưu vị trí điểm danh.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được vị trí.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(purpose: 'CHECKIN' | 'CHECKOUT') {
    try {
      const url = await fetchBlobUrl(`/admin/events/${id}/qr.pdf?purpose=${purpose}`);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${purpose.toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được tệp PDF.');
    }
  }

  if (error && !ev) return <div className="error">{error}</div>;
  if (!ev) return <p>Đang tải…</p>;

  return (
    <>
      <p className="sub"><Link to="/su-kien">← Danh sách sự kiện</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{ev.title}</h1>
          <p className="sub"><StatusBadge status={ev.status} /> · {ev.unit?.name ?? 'Cấp trường'}</p>
        </div>
        {ev.canManage && (
          <div className="row">
            {ev.status === 'DRAFT' && <button className="btn primary" disabled={busy} onClick={() => act('publish')}>Công bố</button>}
            {ev.status === 'PUBLISHED' && <button className="btn primary" disabled={busy} onClick={() => act('open')}>Mở điểm danh</button>}
            {ev.status === 'CHECKIN_OPEN' && <button className="btn danger" disabled={busy} onClick={() => act('close')}>Đóng điểm danh</button>}
          </div>
        )}
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {(ev.checkinState === 'CLOSED' || ev.status === 'REVIEWING' || ev.status === 'FINALIZED') && ev.status !== 'CANCELLED' && (
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <span>{ev.status === 'FINALIZED' ? 'Sự kiện đã chốt điểm rèn luyện.' : 'Đã đóng điểm danh: duyệt các lượt và chốt điểm rèn luyện.'}</span>
          <Link to={`/su-kien/${ev.id}/duyet`} className="btn primary">Duyệt điểm danh</Link>
        </div>
      )}
      {verifyCode && (
        <div className="notice">
          Mã xác nhận 4 số của sự kiện: <b className="mono">{verifyCode}</b>. Mã chỉ hiện một lần, hãy ghi lại để đọc cho sinh viên tại chỗ.
        </div>
      )}

      {ev.checkinState === 'OPEN' && counters && (
        <div className="stats">
          <div className="stat"><b>{counters.checkinCount}</b><span>Đã điểm danh vào</span></div>
          <div className="stat"><b>{counters.checkoutCount}</b><span>Đã điểm danh ra</span></div>
          <div className="stat"><b>{counters.onTimeCount}</b><span>Đúng giờ</span></div>
          <div className="stat"><b>{counters.lateCount}</b><span>Trễ</span></div>
        </div>
      )}

      <div className="card">
        <h2>Thông tin</h2>
        <table>
          <tbody>
            <tr><td>Thời gian</td><td>{fmt(ev.startAt)} – {fmt(ev.endAt)}</td></tr>
            <tr><td>Khung điểm danh</td><td>{fmt(ev.checkinOpenAt)} – {fmt(ev.checkinCloseAt)}</td></tr>
            <tr><td>Địa điểm</td><td>{ev.locationName ?? '—'}</td></tr>
            <tr><td>Kiểm tra vị trí</td><td>{ev.latitude === null ? 'Không yêu cầu' : `Bán kính ${ev.radiusM} m quanh điểm đã đặt`}</td></tr>
            <tr><td>Điểm rèn luyện</td><td>{ev.hasDrl ? ev.drlPoints : 'Không cộng điểm'}</td></tr>
            <tr><td>Mức kiểm soát</td><td>{ev.controlLevel === 'TIGHT' ? 'Chặt (mã 4 số)' : 'Thường'}</td></tr>
            <tr><td>Điểm danh ra</td><td>{ev.requireCheckout ? 'Có' : 'Không'}</td></tr>
            {ev.description && <tr><td>Mô tả</td><td>{ev.description}</td></tr>}
          </tbody>
        </table>
      </div>

      {ev.canManage && ev.status !== 'CANCELLED' && (
        <div className="card">
          <h2>Vị trí điểm danh</h2>
          {saved && <div className="notice">{saved}</div>}
          <GeoFields value={geo} onChange={setGeo} />
          {ev.status !== 'DRAFT' && (
            <label className="field">
              <span>Lý do thay đổi (bắt buộc nếu đã mở điểm danh)</span>
              <input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
          <button className="btn primary" disabled={busy} onClick={saveGeo}>Lưu vị trí</button>
        </div>
      )}

      {qr?.checkin && (
        <div className="card qr">
          <h2>Mã QR điểm danh vào</h2>
          <QrImage eventId={ev.id} purpose="CHECKIN" />
          <p className="mono" style={{ wordBreak: 'break-all' }}>{qr.checkin.url}</p>
          <button className="btn" onClick={() => downloadPdf('CHECKIN')}>Tải PDF để in</button>
        </div>
      )}
      {qr?.checkout && (
        <div className="card qr">
          <h2>Mã QR điểm danh ra</h2>
          <QrImage eventId={ev.id} purpose="CHECKOUT" />
          <p className="mono" style={{ wordBreak: 'break-all' }}>{qr.checkout.url}</p>
          <button className="btn" onClick={() => downloadPdf('CHECKOUT')}>Tải PDF để in</button>
        </div>
      )}
    </>
  );
}
