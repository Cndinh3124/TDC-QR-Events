// Lich hoat dong theo thang (A13): ho so hoat dong + buoi diem danh, theo pham vi nguoi xem.
// Ngay tinh theo gio Viet Nam; thang luu tren URL (?thang=2026-11) de F5 / gui lien ket van giu nguyen.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, EventStatus, Page, Unit } from '../api';
import { useAuth } from '../auth';
import { ACTIVITY_STATUS, StatusBadge, vnDay } from '../format';

export interface CalActivity {
  id: string;
  code: string;
  name: string;
  startAt: string;
  endAt: string;
  status: string;
  unit: { id: string; name: string } | null;
  coUnit: boolean;
}
export interface CalEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: EventStatus;
  locationName: string | null;
  unit: { id: string; name: string } | null;
  canManage: boolean;
}
interface CalendarData {
  activities: CalActivity[];
  events: CalEvent[];
  truncated: boolean;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const DAY_MS = 86_400_000;
const PER_CELL = 3;

// ---- ham thuan (co test) ----

// "2026-11" -> [2026, 11]; sai dinh dang thi tra thang hien tai (gio VN)
export function parseMonth(v: string | null, now = Date.now()): [number, number] {
  const m = v && /^(\d{4})-(\d{2})$/.exec(v);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return [Number(m[1]), Number(m[2])];
  const [y, mo] = vnDay(now).split('-').map(Number);
  return [y, mo];
}

export const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
export const shiftMonth = (y: number, m: number, d: number): [number, number] => {
  const t = y * 12 + (m - 1) + d;
  return [Math.floor(t / 12), (t % 12) + 1];
};

// cac ngay "YYYY-MM-DD" hien tren luoi: tu thu Hai truoc ngay 1 den Chu nhat sau ngay cuoi thang (du tuan)
export function monthGrid(y: number, m: number): string[] {
  const first = Date.UTC(y, m - 1, 1);
  const last = Date.UTC(y, m, 0);
  const lead = (new Date(first).getUTCDay() + 6) % 7; // thu Hai = 0
  const trail = 6 - ((new Date(last).getUTCDay() + 6) % 7);
  const days: string[] = [];
  for (let t = first - lead * DAY_MS; t <= last + trail * DAY_MS; t += DAY_MS) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

// muc co mat trong ngay day (gio VN) neu khoang [start, end] phu ngay do
export const onDay = (day: string, startAt: string, endAt: string) =>
  vnDay(new Date(startAt).getTime()) <= day && day <= vnDay(new Date(endAt).getTime());

const hm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

type Item = { kind: 'activity'; a: CalActivity } | { kind: 'event'; e: CalEvent };

export function ActivityCalendar() {
  const { user } = useAuth();
  const isSchool = user?.role === 'SCHOOL_ADMIN';
  const [params, setParams] = useSearchParams();
  const [y, m] = parseMonth(params.get('thang'));
  const unitId = params.get('unitId') ?? '';
  const show = params.get('hien') ?? 'all'; // all | activity | event
  const view = params.get('kieu') === 'list' ? 'list' : 'grid';

  const [units, setUnits] = useState<Unit[]>([]);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState('');

  const days = useMemo(() => monthGrid(y, m), [y, m]);
  const today = vnDay(Date.now());
  const thisMonth = monthKey(y, m);

  const setParam = (changes: Record<string, string>) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
      return next;
    }, { replace: true });

  useEffect(() => {
    if (isSchool) api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setUnits(p.items)).catch(() => {});
  }, [isSchool]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    const q = new URLSearchParams({ from: days[0], to: days[days.length - 1] });
    if (unitId) q.set('unitId', unitId);
    api<CalendarData>('GET', `/admin/activity-calendar?${q}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Không tải được lịch.'));
    return () => { alive = false; };
  }, [days, unitId]);

  const items = (day: string): Item[] => {
    if (!data) return [];
    const out: Item[] = [];
    if (show !== 'event') for (const a of data.activities) if (onDay(day, a.startAt, a.endAt)) out.push({ kind: 'activity', a });
    if (show !== 'activity') for (const e of data.events) if (onDay(day, e.startAt, e.endAt)) out.push({ kind: 'event', e });
    const start = (i: Item) => (i.kind === 'activity' ? i.a.startAt : i.e.startAt);
    return out.sort((p, q) => start(p).localeCompare(start(q)));
  };

  const chip = (i: Item) => i.kind === 'activity' ? (
    <Link key={`a${i.a.id}`} to={`/hoat-dong/${i.a.id}`} className={`cal-chip act ${ACTIVITY_STATUS[i.a.status]?.[1] ?? 'draft'}`}
      title={`${i.a.code} · ${i.a.name}${i.a.unit ? ` · ${i.a.unit.name}` : ''} · ${ACTIVITY_STATUS[i.a.status]?.[0] ?? i.a.status}${i.a.coUnit ? ' · đơn vị phối hợp' : ''}`}>
      {i.a.name}
    </Link>
  ) : (
    <Link key={`e${i.e.id}`} to={`/su-kien/${i.e.id}`} className="cal-chip evt"
      title={`Điểm danh: ${i.e.title} · ${hm(i.e.startAt)}${i.e.locationName ? ` · ${i.e.locationName}` : ''}${i.e.canManage ? '' : ' · chỉ xem'}`}>
      {hm(i.e.startAt)} {i.e.title}
    </Link>
  );

  const [prevY, prevM] = shiftMonth(y, m, -1);
  const [nextY, nextM] = shiftMonth(y, m, 1);
  const inMonth = days.filter((d) => d.startsWith(thisMonth));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Lịch hoạt động</h1>
        <Link className="btn" to="/hoat-dong">Danh sách hồ sơ</Link>
      </div>

      <div className="toolbar">
        <button className="btn" onClick={() => setParam({ thang: monthKey(prevY, prevM) })} aria-label="Tháng trước">←</button>
        <b style={{ minWidth: 130, textAlign: 'center' }}>Tháng {m}/{y}</b>
        <button className="btn" onClick={() => setParam({ thang: monthKey(nextY, nextM) })} aria-label="Tháng sau">→</button>
        <button className="btn" onClick={() => setParam({ thang: '' })}>Hôm nay</button>
        <select value={show} onChange={(e) => setParam({ hien: e.target.value === 'all' ? '' : e.target.value })} aria-label="Hiển thị">
          <option value="all">Hoạt động và điểm danh</option>
          <option value="activity">Chỉ hồ sơ hoạt động</option>
          <option value="event">Chỉ buổi điểm danh</option>
        </select>
        {isSchool && (
          <select value={unitId} onChange={(e) => setParam({ unitId: e.target.value })} aria-label="Đơn vị">
            <option value="">Mọi đơn vị</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <div className="seg" style={{ marginBottom: 0 }}>
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setParam({ kieu: '' })}>Lưới</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setParam({ kieu: 'list' })}>Danh sách</button>
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {data?.truncated && <div className="notice">Có quá nhiều mục trong tháng, lịch chỉ hiện 500 mục đầu mỗi loại. Hãy lọc theo đơn vị.</div>}
      {!data && !error && <p>Đang tải…</p>}

      {data && view === 'grid' && (
        <div className="cal" role="grid" aria-label={`Lịch tháng ${m}/${y}`}>
          {WEEKDAYS.map((w) => <div key={w} className="cal-head" role="columnheader">{w}</div>)}
          {days.map((d) => {
            const list = items(d);
            return (
              <div key={d} role="gridcell" className={`cal-cell${d.startsWith(thisMonth) ? '' : ' out'}${d === today ? ' today' : ''}`}>
                <div className="cal-day">{Number(d.slice(8))}</div>
                {list.slice(0, PER_CELL).map(chip)}
                {list.length > PER_CELL && (
                  <button className="link cal-more" onClick={() => setParam({ kieu: 'list' })}>+{list.length - PER_CELL} mục khác</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && view === 'list' && (
        <div className="card">
          {inMonth.every((d) => items(d).length === 0) && <p className="sub" style={{ margin: 0 }}>Tháng này chưa có hoạt động hay buổi điểm danh nào.</p>}
          {inMonth.map((d) => {
            const list = items(d);
            if (list.length === 0) return null;
            return (
              <section key={d} className="cal-agenda">
                <h3 className={d === today ? 'today' : ''}>{WEEKDAYS[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]}, {d.split('-').reverse().join('/')}</h3>
                <ul>
                  {list.map((i) => i.kind === 'activity' ? (
                    <li key={`a${i.a.id}`}>
                      <Link to={`/hoat-dong/${i.a.id}`}>{i.a.name}</Link> <span className="sub mono">{i.a.code}</span>{' '}
                      <span className={`badge ${ACTIVITY_STATUS[i.a.status]?.[1] ?? 'draft'}`}>{ACTIVITY_STATUS[i.a.status]?.[0] ?? i.a.status}</span>
                      {i.a.unit && <span className="sub"> · {i.a.unit.name}</span>}{i.a.coUnit && <span className="sub"> · đơn vị phối hợp</span>}
                    </li>
                  ) : (
                    <li key={`e${i.e.id}`}>
                      <span className="sub">{hm(i.e.startAt)}</span> <Link to={`/su-kien/${i.e.id}`}>Điểm danh: {i.e.title}</Link>{' '}
                      <StatusBadge status={i.e.status} />{i.e.unit && <span className="sub"> · {i.e.unit.name}</span>}{!i.e.canManage && <span className="sub"> · chỉ xem</span>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="sub" style={{ marginTop: 12 }}>
        <span className="cal-chip act ok" style={{ display: 'inline-block' }}>Hồ sơ hoạt động</span> màu theo trạng thái hồ sơ ·{' '}
        <span className="cal-chip evt" style={{ display: 'inline-block' }}>Buổi điểm danh</span>
      </p>
    </>
  );
}
