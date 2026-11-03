// Danh sach su kien: tab Dang hoat dong / Da huy / Luu tru + tim kiem, loc, phan trang (dac ta 10, A04).
// Bo loc luu tren URL de F5 va gui lien ket van giu nguyen.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, EventItem, EventStatus, Page, qs, Unit } from '../api';
import { useAuth } from '../auth';
import { Pagination } from '../components/Pagination';
import { ReasonDialog } from '../components/ReasonDialog';
import { fmt, StatusBadge } from '../format';

const VIEWS = [
  ['active', 'Đang hoạt động'],
  ['cancelled', 'Đã hủy'],
  ['archived', 'Lưu trữ'],
] as const;

const STATUS_OPTIONS: Array<[EventStatus, string]> = [
  ['DRAFT', 'Nháp'], ['PUBLISHED', 'Đã công bố'], ['CHECKIN_OPEN', 'Đang điểm danh'],
  ['CHECKIN_CLOSED', 'Đã đóng điểm danh'], ['REVIEWING', 'Chờ duyệt'], ['FINALIZED', 'Hoàn tất'],
];

const PAGE_SIZE = 20;

export function Events() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') ?? 'active') as (typeof VIEWS)[number][0];
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const unitId = params.get('unitId') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [search, setSearch] = useState(q); // o go chu: doi 300 ms moi loc de khong goi API moi phim
  const [units, setUnits] = useState<Unit[]>([]);
  const [data, setData] = useState<Page<EventItem> | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<EventItem | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const isSchool = user?.role === 'SCHOOL_ADMIN';

  const setParam = (changes: Record<string, string>, resetPage = true) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
      if (resetPage) next.delete('page');
      return next;
    }, { replace: true });

  useEffect(() => {
    const t = setTimeout(() => search !== q && setParam({ q: search.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (isSchool) api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setUnits(p.items)).catch(() => {});
  }, [isSchool]);

  useEffect(() => {
    setError('');
    // ngay theo gio Viet Nam (UTC+7); "den ngay" bao gom ca ngay cuoi: 23:59:59.999
    const toDate = to ? new Date(`${to}T23:59:59.999+07:00`).toISOString() : '';
    const fromDate = from ? new Date(`${from}T00:00:00+07:00`).toISOString() : '';
    api<Page<EventItem>>('GET', `/admin/events${qs({ view, q, status, unitId, from: fromDate, to: toDate, page, limit: PAGE_SIZE })}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được danh sách.'));
  }, [view, q, status, unitId, from, to, page, reload]);

  const filtered = Boolean(q || status || unitId || from || to);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Sự kiện</h1>
          <p className="sub">Tạo sự kiện, mở điểm danh và lấy mã QR.</p>
        </div>
        <Link to="/su-kien/moi" className="btn primary">+ Thêm sự kiện</Link>
      </div>

      <div className="seg">
        {VIEWS.map(([key, label]) => (
          <button key={key} className={view === key ? 'on' : ''} onClick={() => setParam({ view: key === 'active' ? '' : key })}>{label}</button>
        ))}
      </div>

      <div className="filters">
        <label className="field">
          <span>Tìm theo tên</span>
          <input type="search" placeholder="Nhập tên sự kiện" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {isSchool && (
          <label className="field">
            <span>Đơn vị tổ chức</span>
            <select value={unitId} onChange={(e) => setParam({ unitId: e.target.value })}>
              <option value="">Tất cả</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Trạng thái</span>
          <select value={status} onChange={(e) => setParam({ status: e.target.value })}>
            <option value="">Tất cả</option>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Từ ngày</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setParam({ from: e.target.value })} />
        </label>
        <label className="field">
          <span>Đến ngày</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setParam({ to: e.target.value })} />
        </label>
        {filtered && (
          <button className="btn" style={{ alignSelf: 'center' }} onClick={() => { setSearch(''); setParams({ ...(view !== 'active' ? { view } : {}) }, { replace: true }); }}>
            Xóa bộ lọc
          </button>
        )}
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <div className="card">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && (
          <p className="sub" style={{ margin: 0 }}>
            {filtered ? 'Không có sự kiện nào khớp bộ lọc.' : 'Chưa có sự kiện nào.'}{' '}
            {!filtered && view === 'active' && <Link to="/su-kien/moi">Thêm sự kiện đầu tiên</Link>}
          </p>
        )}
        {data && data.items.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Tên sự kiện</th><th>Đơn vị</th><th>Bắt đầu</th><th>Điểm RL</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link to={`/su-kien/${e.id}`}>{e.title}</Link>
                      {!e.canManage && <span className="badge info" style={{ marginLeft: 8 }}>Chỉ xem</span>}
                    </td>
                    <td>{e.unit?.name ?? '—'}</td>
                    <td>{fmt(e.startAt)}</td>
                    <td>{e.hasDrl ? e.drlPoints : '—'}</td>
                    <td><StatusBadge status={e.status} checkinState={e.checkinState} archived={e.archivedAt !== null} /></td>
                    <td style={{ textAlign: 'right' }}>
                      {/* [NV] 3.7: chi xoa duoc su kien chua chot va chua co luot diem danh (API kiem tra lai) */}
                      {e.canManage && e.status !== 'FINALIZED' && (
                        <button className="link danger" onClick={() => { setNotice(''); setDeleting(e); }} aria-label={`Xóa sự kiện ${e.title}`}>Xóa</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} total={data.total} limit={data.limit} onPage={(p) => setParam({ page: String(p) }, false)} />}
      </div>

      {deleting && (
        <ReasonDialog
          title={`Xóa hẳn "${deleting.title}"`} confirmText="Xóa hẳn" danger confirmText2={deleting.title}
          extra={<p className="sub">Chỉ xóa được sự kiện <b>chưa có lượt điểm danh</b>. Sự kiện đã có người điểm danh hãy dùng "Hủy sự kiện" hoặc "Lưu trữ" trong trang chi tiết.</p>}
          onClose={() => setDeleting(null)}
          onSubmit={async (reason) => {
            await api('DELETE', `/admin/events/${deleting.id}`, { reason });
            setNotice(`Đã xóa sự kiện "${deleting.title}".`);
            setReload((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
