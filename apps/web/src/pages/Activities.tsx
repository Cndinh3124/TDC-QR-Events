// Danh sach ho so hoat dong (dac ta quan-ly-hoat-dong 10, A10): loc, tim kiem, phan trang, duyet hang loat.
// Bo loc luu tren URL de F5 va gui lien ket van giu nguyen.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AcademicYear, Activity, ActivityCategory, api, ApiError, BulkResult, Page, qs, Unit } from '../api';
import { useAuth } from '../auth';
import { Pagination } from '../components/Pagination';
import { ACTIVITY_STATUS, ActivityBadge, EVALUATION_LABEL, fmt } from '../format';

const PAGE_SIZE = 20;

export function Activities() {
  const { user } = useAuth();
  const isSchool = user?.role === 'SCHOOL_ADMIN';
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const unitId = params.get('unitId') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const yearParam = params.get('year') ?? '';
  const missingMedia = params.get('missingMedia') === 'true';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [search, setSearch] = useState(q);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [data, setData] = useState<Page<Activity> | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  // mac dinh la nam hoc dang chay (hom nay nam trong khoang ngay) hoac nam moi nhat
  const today = new Date().toISOString().slice(0, 10);
  const defaultYear = years.find((y) => y.startDate <= today && today <= y.endDate) ?? years[0];
  const yearId = yearParam || defaultYear?.id || '';

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
    api<AcademicYear[]>('GET', '/admin/academic-years').then(setYears).catch(() => {});
    api<ActivityCategory[]>('GET', '/admin/activity-categories').then(setCategories).catch(() => {});
    if (isSchool) api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setUnits(p.items)).catch(() => {});
  }, [isSchool]);

  useEffect(() => {
    if (years.length === 0) return; // doi co danh sach nam hoc de biet nam mac dinh
    setError('');
    api<Page<Activity>>('GET', `/admin/activities${qs({ academicYearId: yearId, q, status, unitId, categoryId, missingMedia: missingMedia ? 'true' : '', page, limit: PAGE_SIZE })}`)
      .then((d) => { setData(d); setPicked([]); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được danh sách.'));
  }, [years, yearId, q, status, unitId, categoryId, missingMedia, page, reload]);

  const filtered = Boolean(q || status || unitId || categoryId || missingMedia);
  const pendingPlan = data?.items.filter((a) => a.status === 'PENDING_PLAN' && a.canReview) ?? [];
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function bulkApprove() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<BulkResult>('POST', '/admin/activities/bulk/approve', { ids: picked });
      setResult(r);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không duyệt được.');
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id: string) => data?.items.find((a) => a.id === id)?.code ?? id.slice(0, 8);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Hồ sơ hoạt động</h1>
          <p className="sub">Kế hoạch, báo cáo kết quả, đánh giá và khen thưởng của từng hoạt động Đoàn – Hội.</p>
        </div>
        <Link to="/hoat-dong/moi" className="btn primary">+ Thêm hoạt động</Link>
      </div>

      <div className="filters">
        <label className="field">
          <span>Năm học</span>
          <select value={yearId} onChange={(e) => setParam({ year: e.target.value })}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.locked ? ' (đã khóa)' : ''}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Tìm theo mã hoặc tên</span>
          <input type="search" placeholder="Ví dụ 2026-001 hoặc hội thảo" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {isSchool && (
          <label className="field">
            <span>Đơn vị</span>
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
            {Object.entries(ACTIVITY_STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Lĩnh vực</span>
          <select value={categoryId} onChange={(e) => setParam({ categoryId: e.target.value })}>
            <option value="">Tất cả</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={missingMedia} onChange={(e) => setParam({ missingMedia: e.target.checked ? 'true' : '' })} />
          <span>Thiếu truyền thông</span>
        </label>
        {filtered && (
          <button className="btn" style={{ alignSelf: 'center' }} onClick={() => { setSearch(''); setParams(yearParam ? { year: yearParam } : {}, { replace: true }); }}>
            Xóa bộ lọc
          </button>
        )}
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {isSchool && picked.length > 0 && (
        <div className="bulkbar">
          <b>Đã chọn {picked.length} hồ sơ</b>
          <button className="btn primary" disabled={busy} onClick={bulkApprove}>{busy ? 'Đang duyệt…' : 'Duyệt kế hoạch đã chọn'}</button>
          <button className="btn" onClick={() => setPicked([])}>Bỏ chọn</button>
        </div>
      )}
      {result && (
        <div className={result.failed.length ? 'error' : 'notice'} role="status">
          Đã duyệt {result.done.length} hồ sơ.
          {result.failed.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {result.failed.map((f) => <li key={f.id}>{nameOf(f.id)}: {f.message}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && (
          <p className="sub" style={{ margin: 0 }}>
            {filtered ? 'Không có hoạt động nào khớp bộ lọc.' : 'Chưa có hoạt động nào trong năm học này.'}{' '}
            {!filtered && <Link to="/hoat-dong/moi">Thêm hoạt động đầu tiên</Link>}
          </p>
        )}
        {data && data.items.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  {isSchool && <th style={{ width: 32 }} aria-label="Chọn" />}
                  <th>Mã</th><th>Tên hoạt động</th><th>Đơn vị</th><th>Thời gian</th><th>Tham gia</th><th>Truyền thông</th><th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    {isSchool && (
                      <td>
                        {pendingPlan.some((p) => p.id === a.id) && (
                          <input type="checkbox" aria-label={`Chọn ${a.code}`} checked={picked.includes(a.id)} onChange={() => toggle(a.id)} />
                        )}
                      </td>
                    )}
                    <td className="mono">{a.code}</td>
                    <td>
                      <Link to={`/hoat-dong/${a.id}`}>{a.name}</Link>
                      {a.category && <small className="hint" style={{ marginTop: 0 }}>{a.category.name}</small>}
                    </td>
                    <td>{a.unit?.name ?? '—'}</td>
                    <td>{fmt(a.startAt)}</td>
                    <td>{a.actualCount ?? '—'}{a.expectedCount !== null && <span className="sub"> / {a.expectedCount}</span>}</td>
                    <td>{a.counts.media > 0 ? a.counts.media : <span className="badge draft">Chưa có</span>}</td>
                    <td>
                      <ActivityBadge status={a.status} />{' '}
                      {a.evaluation && <span className={`badge ${EVALUATION_LABEL[a.evaluation][1]}`}>{EVALUATION_LABEL[a.evaluation][0]}</span>}
                      {a.returnNote && a.status === 'DRAFT' && <span className="badge err" title={a.returnNote}>Cần bổ sung</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pagination page={page} total={data.total} limit={PAGE_SIZE} onPage={(p) => setParam({ page: String(p) }, false)} />}
    </>
  );
}
