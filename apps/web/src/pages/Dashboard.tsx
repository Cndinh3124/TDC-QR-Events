// Tong quan: KPI co so sanh ky truoc, bieu do theo ngay / theo khoa, su kien dang dien ra (cap nhat 10 giay), nhac viec - dac ta 10
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, Overview, Page, qs, Reminders, Unit } from '../api';
import { DailyChart, FacultyBars } from '../components/BarChart';
import { delta, dmy, fmt, StatusBadge, vnDay } from '../format';

const LIVE_POLL_MS = 10_000;
const IDLE_POLL_MS = 60_000;

export function Dashboard() {
  const [from, setFrom] = useState(() => vnDay(Date.now() - 29 * 86400_000));
  const [to, setTo] = useState(() => vnDay(Date.now()));
  const [faculty, setFaculty] = useState('');
  const [faculties, setFaculties] = useState<Unit[]>([]);
  const [data, setData] = useState<Overview | null>(null);
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([
        api<Overview>('GET', `/admin/dashboard/overview${qs({ from, to, facultyUnitId: faculty })}`),
        api<Reminders>('GET', '/admin/dashboard/reminders'),
      ]);
      setData(o);
      setReminders(r);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được số liệu.');
    }
  }, [from, to, faculty]);

  useEffect(() => {
    api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setFaculties(p.items.filter((u) => u.type === 'FACULTY' && u.isActive))).catch(() => {});
  }, []);

  // co su kien dang dien ra thi lam moi moi 10 giay; tab bi an thi tam dung
  const liveCount = data?.live.length ?? 0;
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), liveCount > 0 ? LIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(t);
  }, [load, liveCount]);

  const k = data?.kpis;
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
  const onTimeDelta = k && k.onTimeRate.value !== null && k.onTimeRate.previous !== null
    ? Math.round((k.onTimeRate.value - k.onTimeRate.previous) * 100) : null;

  return (
    <>
      <h1>Tổng quan</h1>
      <p className="sub">Số liệu theo lượt điểm danh chưa bị hủy, tính theo giờ Việt Nam.</p>

      <div className="toolbar">
        <label>Từ ngày <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label>Đến ngày <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        {faculties.length > 1 && (
          <label>Khoa{' '}
            <select value={faculty} onChange={(e) => setFaculty(e.target.value)}>
              <option value="">Tất cả</option>
              {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {!data && !error && <p>Đang tải…</p>}

      {reminders && (reminders.pendingReview.length > 0 || reminders.appealsDue.length > 0) && (
        <div className="row" style={{ alignItems: 'stretch', marginBottom: 20 }}>
          {reminders.pendingReview.length > 0 && (
            <div className="card remind" style={{ flex: 1, margin: 0 }}>
              <b>Sự kiện đã kết thúc, còn lượt chưa duyệt</b>
              <ul>{reminders.pendingReview.map((r) => (
                <li key={r.eventId}><Link to={`/su-kien/${r.eventId}/duyet`}>{r.title}</Link> — {r.pendingCount} lượt chờ (kết thúc {fmt(r.endAt)})</li>
              ))}</ul>
            </div>
          )}
          {reminders.appealsDue.length > 0 && (
            <div className={`card remind${reminders.appealsDue.some((a) => a.overdue) ? ' late' : ''}`} style={{ flex: 1, margin: 0 }}>
              <b>Khiếu nại sắp hết hạn xử lý</b>
              <ul>{reminders.appealsDue.map((a) => (
                <li key={a.appealId}>
                  <Link to="/khieu-nai">{a.fullName ?? a.mssv}</Link> ({a.mssv}) — {a.eventTitle}, {a.overdue ? <b>đã quá hạn {fmt(a.deadlineAt)}</b> : `hạn ${fmt(a.deadlineAt)}`}
                </li>
              ))}</ul>
            </div>
          )}
        </div>
      )}

      {data && k && (
        <>
          <div className="stats six">
            <Stat label="Lượt điểm danh" value={k.attendance.value} d={delta(k.attendance.value, k.attendance.previous)} />
            <div className="stat">
              <b>{pct(k.onTimeRate.value)}</b><span>Tỷ lệ đúng giờ</span>
              <small className={onTimeDelta === null ? '' : onTimeDelta >= 0 ? 'delta up' : 'delta down'}>
                {onTimeDelta === null ? 'Chưa có kỳ trước để so sánh' : `${onTimeDelta > 0 ? '+' : ''}${onTimeDelta} điểm % so với kỳ trước`}
              </small>
            </div>
            <Stat label="Sinh viên tham gia" value={k.students.value} d={delta(k.students.value, k.students.previous)} />
            <Stat label="Điểm rèn luyện đã cộng" value={k.drl.value} d={delta(k.drl.value, k.drl.previous)} />
            <div className="stat"><b>{k.pendingReview}</b><span>Lượt chờ duyệt</span><small><Link to="/su-kien">Đến danh sách sự kiện</Link></small></div>
            <div className="stat"><b>{k.openAppeals}</b><span>Khiếu nại đang mở</span><small><Link to="/khieu-nai">Xử lý khiếu nại</Link></small></div>
          </div>
          <p className="sub" style={{ marginTop: -8 }}>So với {data.range.days} ngày trước đó. Lượt chờ duyệt và khiếu nại là số hiện tại, không theo khoảng ngày.</p>

          <div className="cols2">
            <div className="card">
              <h2>Lượt điểm danh theo ngày</h2>
              <div className="legend"><span><i style={{ background: 'var(--primary)' }} />Đúng giờ</span><span><i style={{ background: '#f0b45a' }} />Trễ</span></div>
              <DailyChart data={data.daily} />
            </div>
            <div className="card">
              <h2>Theo khoa</h2>
              <FacultyBars rows={data.byFaculty} />
            </div>
          </div>

          <div className="card tablewrap">
            <h2>Đang điểm danh {data.live.length > 0 && <span className="badge ok">trực tiếp</span>}</h2>
            {data.live.length === 0 ? <p className="sub" style={{ margin: 0 }}>Hiện không có sự kiện nào đang mở điểm danh.</p> : (
              <table>
                <thead><tr><th>Sự kiện</th><th>Đơn vị</th><th>Điểm danh vào</th><th>Đúng giờ / trễ</th><th>Điểm danh ra</th></tr></thead>
                <tbody>{data.live.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/su-kien/${e.id}`}>{e.title}</Link></td><td>{e.unitName ?? '—'}</td>
                    <td><b>{e.checkinCount}</b></td><td>{e.onTimeCount} / {e.lateCount}</td><td>{e.checkoutCount}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          <div className="card tablewrap">
            <h2>Sự kiện gần đây</h2>
            {data.recent.length === 0 ? <p className="sub" style={{ margin: 0 }}>Chưa có sự kiện nào.</p> : (
              <table>
                <thead><tr><th>Sự kiện</th><th>Đơn vị</th><th>Bắt đầu</th><th>Lượt điểm danh</th><th>Trạng thái</th></tr></thead>
                <tbody>{data.recent.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/su-kien/${e.id}`}>{e.title}</Link></td><td>{e.unitName ?? '—'}</td>
                    <td>{fmt(e.startAt)}</td><td>{e.attendanceCount}</td><td><StatusBadge status={e.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <p className="sub">Khoảng đang xem: {dmy(data.range.from)} – {dmy(data.range.to)}.</p>
        </>
      )}
    </>
  );
}

function Stat({ label, value, d }: { label: string; value: number; d: { text: string; tone: string } }) {
  return (
    <div className="stat">
      <b>{value.toLocaleString('vi-VN')}</b><span>{label}</span>
      <small className={`delta ${d.tone}`}>{d.text === '—' ? 'Không đổi so với kỳ trước' : d.text === 'mới' ? 'Kỳ trước chưa có' : `${d.text} so với kỳ trước`}</small>
    </div>
  );
}
