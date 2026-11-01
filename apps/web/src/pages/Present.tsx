// Trinh chieu QR toan man hinh tai hoi truong (P08) - dac ta 3.2, chot-giao-dien.md muc 1.
// Can dang nhap vi co chua ma QR. Chu to de doc tren man chieu; thanh dieu khien tu an sau 5 giay.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, Counters, EventItem, fetchBlobUrl } from '../api';
import { LogoTrio } from '../components/Brand';
import { fmt } from '../format';

type Mode = 'CHECKIN' | 'CHECKOUT' | 'CODE';

// "01:02:03" tu so mili giay con lai
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function Present() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const verifyCode = (loc.state as { verifyCode?: string | null } | null)?.verifyCode ?? null;
  const [ev, setEv] = useState<EventItem | null>(null);
  const [hasOut, setHasOut] = useState(false);
  const [mode, setMode] = useState<Mode>('CHECKIN');
  const [src, setSrc] = useState('');
  const [url, setUrl] = useState('');
  const [counters, setCounters] = useState<Counters | null>(null);
  const [now, setNow] = useState(Date.now());
  const [bar, setBar] = useState(true);
  const [error, setError] = useState('');
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // su kien + thong tin ma QR
  useEffect(() => {
    (async () => {
      try {
        const e = await api<EventItem>('GET', `/admin/events/${id}`);
        setEv(e);
        if (!e.canManage) return setError('Bạn chỉ được xem sự kiện này, không lấy được mã QR để trình chiếu.');
        if (e.status === 'DRAFT' || e.status === 'CANCELLED' || e.archivedAt) return setError('Sự kiện chưa công bố, đã hủy hoặc đã lưu trữ nên chưa có mã QR để chiếu.');
        const qr = await api<{ checkin: { url: string } | null; checkout: { url: string } | null }>('GET', `/admin/events/${id}/qr`);
        setHasOut(Boolean(qr.checkout));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải được sự kiện.');
      }
    })();
  }, [id]);

  // anh QR theo che do dang chieu
  useEffect(() => {
    if (mode === 'CODE' || !ev || error) return;
    let obj = '';
    fetchBlobUrl(`/admin/events/${id}/qr.png?purpose=${mode}`).then((u) => { obj = u; setSrc(u); }).catch(() => setSrc(''));
    api<{ checkin: { url: string } | null; checkout: { url: string } | null }>('GET', `/admin/events/${id}/qr`)
      .then((q) => setUrl((mode === 'CHECKIN' ? q.checkin : q.checkout)?.url ?? '')).catch(() => {});
    return () => { if (obj) URL.revokeObjectURL(obj); };
  }, [id, mode, ev, error]);

  // so dem truc tiep 10 giay + dong ho 1 giay
  useEffect(() => {
    if (!ev || error) return;
    const tick = () => api<Counters>('GET', `/admin/events/${id}/counters`).then(setCounters).catch(() => {});
    tick();
    const c = setInterval(tick, 10000);
    return () => clearInterval(c);
  }, [ev, id, error]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // thanh dieu khien: hien khi co thao tac, tu an sau 5 giay
  const wake = useCallback(() => {
    setBar(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBar(false), 5000);
  }, []);
  useEffect(() => {
    wake();
    const onKey = (e: KeyboardEvent) => {
      wake();
      if (e.key === 'Escape' && !document.fullscreenElement) nav(`/su-kien/${id}`);
    };
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(hideTimer.current);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('keydown', onKey);
    };
  }, [wake, nav, id]);

  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});

  if (error) return <div className="present-empty"><div className="error">{error}</div><Link to={`/su-kien/${id}`} className="btn">← Về sự kiện</Link></div>;
  if (!ev) return <div className="present-empty"><p>Đang tải…</p></div>;

  // trang thai diem danh: PUBLISHED theo khung gio (dem nguoc), con lai do bam tay
  const auto = ev.status === 'PUBLISHED';
  const openAt = new Date(ev.checkinOpenAt).getTime();
  const closeAt = new Date(ev.checkinCloseAt).getTime();
  let timer = 'Điều khiển tay';
  let timerLabel = 'Đang mở điểm danh';
  if (ev.checkinState === 'NOT_YET') { timerLabel = 'Mở điểm danh sau'; timer = clock(openAt - now); }
  else if (ev.checkinState === 'CLOSED') { timerLabel = 'Điểm danh'; timer = 'Đã đóng'; }
  else if (auto) { timerLabel = 'Đóng điểm danh sau'; timer = clock(closeAt - now); }

  const out = mode === 'CHECKOUT';
  const count = counters ? (out ? counters.checkoutCount : counters.checkinCount) : null;

  return (
    <div className="present" onDoubleClick={fullscreen}>
      <section className="p-left">
        <LogoTrio size={56} />
        <div>
          <div className="p-tag">{mode === 'CODE' ? 'Mã xác nhận điểm danh ra' : out ? 'Điểm danh ra' : 'Điểm danh vào'}</div>
          <h1>{ev.title}</h1>
          <p className="p-meta">{ev.locationName ? `${ev.locationName} · ` : ''}{fmt(ev.startAt)}{ev.hasDrl && ` · +${ev.drlPoints} điểm rèn luyện`}</p>
        </div>
        <ol className="p-steps">
          <li>Mở camera điện thoại và quét mã QR</li>
          <li>Nhập MSSV, họ tên và chọn khoa</li>
          <li>Bấm xác nhận để nhận vé điểm danh</li>
        </ol>
      </section>
      <section className="p-right">
        {mode === 'CODE' ? (
          <div className="p-code" aria-label="Mã xác nhận 4 số">{verifyCode ?? '----'}</div>
        ) : src ? (
          <img className="p-qr" src={src} alt={`Mã QR điểm danh ${out ? 'ra' : 'vào'}`} />
        ) : (
          <p>Đang tải mã QR…</p>
        )}
        {mode !== 'CODE' && url && <p className="mono p-url">{url}</p>}
        <div className="p-stats">
          <div><b>{count ?? '—'}</b><span>{out ? 'Đã điểm danh ra' : 'Đã điểm danh'}</span></div>
          <div><b className="p-timer">{timer}</b><span>{timerLabel}</span></div>
        </div>
      </section>

      <div className={`p-bar${bar ? '' : ' hidden'}`}>
        <Link to={`/su-kien/${id}`} className="btn">← Thoát</Link>
        <div className="seg" style={{ margin: 0 }}>
          <button className={mode === 'CHECKIN' ? 'on' : ''} onClick={() => setMode('CHECKIN')}>QR vào</button>
          {hasOut && <button className={mode === 'CHECKOUT' ? 'on' : ''} onClick={() => setMode('CHECKOUT')}>QR ra</button>}
          {verifyCode && <button className={mode === 'CODE' ? 'on' : ''} onClick={() => setMode('CODE')}>Mã 4 số</button>}
        </div>
        <button className="btn" onClick={fullscreen}>Toàn màn hình</button>
      </div>
    </div>
  );
}
