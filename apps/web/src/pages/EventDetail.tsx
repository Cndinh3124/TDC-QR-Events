// Chi tiet su kien (A06): thong tin, cong bo / mo / dong, so dem truc tiep, tab Ma QR / Chia se cho khoa / Nhat ky.
// Moi nut chi hien khi co quyen; backend van kiem tra lai quyen va pham vi khoa - dac ta 3.7.
import { FormEvent, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, Counters, EventItem } from '../api';
import { useAuth } from '../auth';
import { Dialog } from '../components/Dialog';
import { ReasonDialog } from '../components/ReasonDialog';
import { fmt, StatusBadge, toIso, toLocalInput } from '../format';
import { LogPanel } from './event/LogPanel';
import { QrPanel } from './event/QrPanel';
import { SharePanel } from './event/SharePanel';

const MapPicker = lazy(() => import('../components/MapPicker').then((m) => ({ default: m.MapPicker })));

type Tab = 'tong-quan' | 'ma-qr' | 'chia-se' | 'nhat-ky';
type Dlg = 'cancel' | 'archive' | 'restore' | 'delete' | 'duplicate' | null;
type Simple = 'publish' | 'open' | 'close' | 'auto';

function DuplicateDialog({ ev, onClose }: { ev: EventItem; onClose: () => void }) {
  const nav = useNavigate();
  const week = 7 * 24 * 3600_000;
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState(toLocalInput(new Date(new Date(ev.startAt).getTime() + week).toISOString()));
  const [endAt, setEndAt] = useState(toLocalInput(new Date(new Date(ev.endAt).getTime() + week).toISOString()));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: Record<string, string> = { startAt: toIso(startAt), endAt: toIso(endAt) };
      if (title.trim()) body.title = title.trim();
      const copy = await api<EventItem>('POST', `/admin/events/${ev.id}/duplicate`, body);
      nav(`/su-kien/${copy.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không nhân bản được.');
      setBusy(false);
    }
  }

  return (
    <Dialog title="Nhân bản sự kiện" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="sub">Chép thông tin sang một sự kiện Nháp mới. Không chép mã QR, mã 4 số, quyền xem của khoa và lượt điểm danh.</p>
        {error && <div className="error" role="alert">{error}</div>}
        <label className="field"><span>Tên (để trống = giữ tên cũ)</span><input maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="grid2">
          <label className="field"><span>Bắt đầu *</span><input type="datetime-local" required value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
          <label className="field"><span>Kết thúc *</span><input type="datetime-local" required value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Đang tạo…' : 'Nhân bản'}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function EventDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'tong-quan') as Tab;
  // ma 4 so chi hien mot lan: giu trong bo nho cua phien (state cua router), khong luu o dau khac
  const [verifyCode, setVerifyCode] = useState<string | null>((location.state as { verifyCode?: string | null } | null)?.verifyCode ?? null);
  const [ev, setEv] = useState<EventItem | null>(null);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dlg>(null);
  const isSchool = user?.role === 'SCHOOL_ADMIN';

  const load = useCallback(async () => {
    try {
      setEv(await api<EventItem>('GET', `/admin/events/${id}`));
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

  async function act(action: Simple) {
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

  const setTab = (t: Tab) => setParams(t === 'tong-quan' ? {} : { tab: t }, { replace: true, state: location.state });

  if (error && !ev) return <div className="error">{error}</div>;
  if (!ev) return <p>Đang tải…</p>;

  const archived = ev.archivedAt !== null;
  const live = !archived && ev.status !== 'CANCELLED';
  const canShare = isSchool && ev.unit?.type === 'SCHOOL';
  const manual = ev.status === 'CHECKIN_OPEN' || ev.status === 'CHECKIN_CLOSED';

  const tabs: Array<[Tab, string]> = [['tong-quan', 'Tổng quan'], ['ma-qr', 'Mã QR']];
  if (canShare) tabs.push(['chia-se', 'Chia sẻ cho khoa']);
  if (isSchool) tabs.push(['nhat-ky', 'Nhật ký']);

  return (
    <>
      <p className="sub"><Link to="/su-kien">← Danh sách sự kiện</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{ev.title}</h1>
          <p className="sub">
            <StatusBadge status={ev.status} checkinState={ev.checkinState} archived={archived} /> · {ev.unit?.name ?? 'Cấp trường'}
            {manual && <> · <span title="Mở / đóng bằng tay, không theo khung giờ">Điều khiển tay</span></>}
            {!ev.canManage && <> · <span className="badge info">Chỉ xem — do Đoàn trường chia sẻ</span></>}
          </p>
        </div>
        {ev.canManage && (
          <div className="row">
            {ev.status === 'DRAFT' && <button className="btn primary" disabled={busy} onClick={() => act('publish')}>Công bố</button>}
            {live && ev.status === 'PUBLISHED' && ev.checkinState !== 'OPEN' && <button className="btn primary" disabled={busy} onClick={() => act('open')}>Mở điểm danh</button>}
            {live && ev.checkinState === 'OPEN' && <button className="btn danger" disabled={busy} onClick={() => act('close')}>Đóng điểm danh</button>}
            {live && ev.checkinState === 'OPEN' && <Link to={`/trinh-chieu/${ev.id}`} state={{ verifyCode }} className="btn">Trình chiếu QR</Link>}
            {live && ev.status !== 'FINALIZED' && <Link to={`/su-kien/${ev.id}/sua`} className="btn">Sửa</Link>}
            <details className="menu">
              <summary className="btn" role="button">Thao tác khác ▾</summary>
              <div className="menu-list">
                {live && manual && <button onClick={() => act('auto')}>Quay lại điều khiển theo giờ</button>}
                <button onClick={() => setDialog('duplicate')}>Nhân bản</button>
                {archived && <button onClick={() => setDialog('restore')}>Khôi phục từ lưu trữ</button>}
                {!archived && ev.status !== 'DRAFT' && <button onClick={() => setDialog('archive')}>Lưu trữ</button>}
                {live && ev.status !== 'DRAFT' && ev.status !== 'FINALIZED' && <button className="danger" onClick={() => setDialog('cancel')}>Hủy sự kiện</button>}
                {ev.status !== 'FINALIZED' && <button className="danger" onClick={() => setDialog('delete')}>Xóa hẳn</button>}
              </div>
            </details>
          </div>
        )}
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {ev.status === 'CANCELLED' && <div className="error">Sự kiện đã hủy{ev.cancelReason ? `: ${ev.cancelReason}` : ''}. Không nhận điểm danh và không cộng điểm rèn luyện.</div>}
      {archived && <div className="notice">Sự kiện đang ở mục Lưu trữ, không nhận điểm danh. Khôi phục để dùng lại.</div>}
      {verifyCode && tab === 'tong-quan' && (
        <div className="notice">Mã xác nhận 4 số của sự kiện: <b className="mono">{verifyCode}</b>. Mã chỉ hiện một lần, hãy ghi lại để đọc cho sinh viên tại chỗ.</div>
      )}

      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'tong-quan' && (
        <>
          {live && (ev.checkinState === 'CLOSED' || ev.status === 'REVIEWING' || ev.status === 'FINALIZED') && ev.canManage && (
            <div className="card row" style={{ justifyContent: 'space-between' }}>
              <span>{ev.status === 'FINALIZED' ? 'Sự kiện đã chốt điểm rèn luyện.' : 'Đã đóng điểm danh: duyệt các lượt và chốt điểm rèn luyện.'}</span>
              <Link to={`/su-kien/${ev.id}/duyet`} className="btn primary">Duyệt điểm danh</Link>
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
            <div className="tablewrap">
              <table>
                <tbody>
                  <tr><td>Thời gian</td><td>{fmt(ev.startAt)} – {fmt(ev.endAt)}</td></tr>
                  <tr><td>Khung điểm danh</td><td>{fmt(ev.checkinOpenAt)} – {fmt(ev.checkinCloseAt)} (ân hạn “Đúng giờ” {ev.graceMinutes} phút)</td></tr>
                  <tr><td>Địa điểm</td><td>{ev.locationName ?? '—'}</td></tr>
                  <tr><td>Kiểm tra vị trí</td><td>{ev.latitude === null ? 'Không yêu cầu' : `Bán kính ${ev.radiusM} m quanh điểm đã đặt`}</td></tr>
                  <tr><td>Điểm rèn luyện</td><td>{ev.hasDrl ? ev.drlPoints : 'Không cộng điểm'}</td></tr>
                  <tr><td>Mức kiểm soát</td><td>{ev.controlLevel === 'TIGHT' ? 'Chặt (QR ra + mã 4 số)' : 'Thường'}</td></tr>
                  <tr><td>Điểm danh ra</td><td>{ev.requireCheckout ? 'Bắt buộc' : 'Không'}</td></tr>
                  {isSchool && ev.unit?.type === 'SCHOOL' && (
                    <tr><td>Khoa được xem</td><td>{ev.facultyViewMode === 'NONE' ? 'Không chia sẻ' : ev.facultyViewMode === 'ALL' ? 'Mọi khoa' : `${ev.facultyViewUnitIds?.length ?? 0} khoa được chọn`}</td></tr>
                  )}
                  {ev.description && <tr><td>Mô tả</td><td style={{ whiteSpace: 'pre-wrap' }}>{ev.description}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {ev.latitude !== null && ev.canManage && (
            <div className="card">
              <h2>Vùng điểm danh</h2>
              <Suspense fallback={<p className="sub">Đang tải bản đồ…</p>}>
                <MapPicker latitude={ev.latitude} longitude={ev.longitude} radiusM={ev.radiusM} height={260} />
              </Suspense>
              <p className="sub" style={{ margin: '8px 0 0' }}>Tọa độ chỉ hiện ở trang quản trị, không lộ ra trang điểm danh của sinh viên.</p>
            </div>
          )}
        </>
      )}
      {tab === 'ma-qr' && <QrPanel ev={ev} verifyCode={verifyCode} onVerifyCode={setVerifyCode} />}
      {tab === 'chia-se' && canShare && <SharePanel ev={ev} onSaved={load} />}
      {tab === 'nhat-ky' && isSchool && <LogPanel eventId={ev.id} />}

      {dialog === 'duplicate' && <DuplicateDialog ev={ev} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && (
        <ReasonDialog title="Hủy sự kiện" confirmText="Hủy sự kiện" danger confirmText2={ev.title} onClose={() => setDialog(null)}
          extra={<div className="error">Sự kiện hủy sẽ không nhận điểm danh, không cộng điểm rèn luyện và mã QR hết hiệu lực. Không hoàn tác được.</div>}
          onSubmit={async (reason) => { await api('POST', `/admin/events/${id}/cancel`, { reason }); await load(); }} />
      )}
      {dialog === 'archive' && (
        <ReasonDialog title="Lưu trữ sự kiện" confirmText="Lưu trữ" onClose={() => setDialog(null)}
          extra={<p className="sub">Sự kiện được ẩn khỏi danh sách đang hoạt động và có thể khôi phục.</p>}
          onSubmit={async (reason) => { await api('POST', `/admin/events/${id}/archive`, { reason }); await load(); }} />
      )}
      {dialog === 'restore' && (
        <ReasonDialog title="Khôi phục sự kiện" confirmText="Khôi phục" onClose={() => setDialog(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/events/${id}/restore`, { reason }); await load(); }} />
      )}
      {dialog === 'delete' && (
        <ReasonDialog title="Xóa hẳn sự kiện" confirmText="Xóa hẳn" danger confirmText2={ev.title} onClose={() => setDialog(null)}
          extra={<div className="error">Chỉ xóa được khi sự kiện chưa có lượt điểm danh nào. Đã có thì hãy dùng “Hủy sự kiện” hoặc “Lưu trữ”. Không hoàn tác được.</div>}
          onSubmit={async (reason) => { await api('DELETE', `/admin/events/${id}`, { reason }); nav('/su-kien', { replace: true }); }} />
      )}
    </>
  );
}
