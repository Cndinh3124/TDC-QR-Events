// Thong ke hoat dong theo nam hoc (dac ta quan-ly-hoat-dong 10, B10): KPI, theo don vi / linh vuc / thang, xuat Excel.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AcademicYear, ActivityGroup, ActivityStats as Stats, api, ApiError, download, qs } from '../api';
import { ACTIVITY_STATUS, vnd } from '../format';

function Bars({ rows }: { rows: ActivityGroup[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) return <p className="sub">Chưa có dữ liệu.</p>;
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className="hbar" title={`${r.label}: ${r.total} hoạt động, ${r.completed} hoàn thành`}>
          <span className="hbar-name">{r.label.replace(/^Khoa /, '')}</span>
          <span className="hbar-track"><span style={{ width: `${(r.total / max) * 100}%` }} /></span>
          <b>{r.total}</b>
        </div>
      ))}
    </>
  );
}

export function ActivityStats() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AcademicYear[]>('GET', '/admin/academic-years').then(setYears).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    setError('');
    api<Stats>('GET', `/admin/activity-stats${qs({ academicYearId: yearId })}`)
      .then((s) => { setData(s); if (!yearId) setYearId(s.year.id); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được thống kê.'));
  }, [yearId]);

  async function exportXlsx() {
    setBusy(true);
    try {
      await download(`/admin/activity-stats/export.xlsx${qs({ academicYearId: yearId })}`, 'hoat-dong.xlsx');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không xuất được tệp.');
    } finally {
      setBusy(false);
    }
  }

  const k = data?.kpi;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Thống kê hoạt động</h1>
          <p className="sub">Số liệu theo năm học trong phạm vi bạn quản lý. <Link to="/hoat-dong">Xem danh sách hồ sơ</Link></p>
        </div>
        <div className="row">
          <label className="field" style={{ margin: 0 }}>
            <span>Năm học</span>
            <select value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
          <button className="btn primary" style={{ alignSelf: 'end' }} disabled={busy || !data} onClick={exportXlsx}>{busy ? 'Đang xuất…' : 'Xuất Excel'}</button>
        </div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {!data && !error && <p>Đang tải…</p>}
      {data && k && (
        <>
          <div className="stats six">
            <div className="stat"><b>{k.total}</b><span>Hoạt động</span></div>
            <div className="stat"><b>{k.completionRate === null ? '—' : `${k.completionRate}%`}</b><span>Tỉ lệ hoàn thành</span><small>{k.completed}/{k.evaluated} đã đánh giá</small></div>
            <div className="stat"><b>{k.participants.toLocaleString('vi-VN')}</b><span>Lượt tham gia</span></div>
            <div className="stat"><b>{k.rewarded}</b><span>Được khen thưởng</span></div>
            <div className="stat"><b>{k.withMedia}</b><span>Có truyền thông</span><small>{k.missingMedia} chưa có · {k.mediaLinks} sản phẩm</small></div>
            <div className="stat"><b>{k.publicationLinks}</b><span>Bài đăng / tin bài</span></div>
          </div>
          <p className="sub">Kinh phí: dự kiến {vnd(k.budgetPlanned)} · thực tế {vnd(k.budgetActual)}</p>

          <div className="cols2">
            <div className="card">
              <h2>Theo đơn vị</h2>
              <Bars rows={data.byUnit} />
            </div>
            <div className="card">
              <h2>Theo trạng thái</h2>
              <ul className="plain">
                {Object.entries(ACTIVITY_STATUS).map(([s, [label]]) => <li key={s}>{label}: <b>{data.byStatus[s] ?? 0}</b></li>)}
              </ul>
            </div>
          </div>
          <div className="cols2">
            <div className="card">
              <h2>Theo lĩnh vực</h2>
              <Bars rows={data.byCategory} />
            </div>
            <div className="card">
              <h2>Theo tháng</h2>
              <Bars rows={data.byMonth.map((m) => ({ ...m, label: m.key.split('-').reverse().join('/') }))} />
            </div>
          </div>

          <div className="card">
            <h2>Bảng tổng hợp theo đơn vị</h2>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Đơn vị</th><th>Hoạt động</th><th>Hoàn thành</th><th>Chưa hoàn thành</th><th>Có truyền thông</th><th>Lượt tham gia</th></tr></thead>
                <tbody>
                  {data.byUnit.map((u) => (
                    <tr key={u.key}><td>{u.label}</td><td>{u.total}</td><td>{u.completed}</td><td>{u.notCompleted}</td><td>{u.withMedia}</td><td>{u.participants.toLocaleString('vi-VN')}</td></tr>
                  ))}
                  {data.byUnit.length === 0 && <tr><td colSpan={6} className="sub">Chưa có hoạt động nào trong năm học này.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
