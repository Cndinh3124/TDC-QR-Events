// Bao cao tong hop DRL theo sinh vien / theo khoa + xuat Excel - dac ta 3.6
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, download, DrlReport, qs } from '../api';

const LIMIT = 50;

export function Reports() {
  const [by, setBy] = useState<'student' | 'faculty'>('faculty');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DrlReport | null>(null);
  const [error, setError] = useState('');

  const params = { by, from: from || undefined, to: to || undefined };
  const load = useCallback(async () => {
    try {
      setData(await api<DrlReport>('GET', `/admin/reports/drl${qs({ ...params, page, limit: LIMIT })}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được báo cáo.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [by, from, to, page]);

  useEffect(() => { load(); }, [load]);

  async function exportXlsx() {
    try {
      await download(`/admin/reports/drl.xlsx${qs(params)}`, 'tong-hop-drl.xlsx');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không xuất được tệp.');
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1>Báo cáo điểm rèn luyện</h1><p className="sub">Chỉ tính lượt đã duyệt của sự kiện đã chốt. Lọc theo ngày bắt đầu sự kiện.</p></div>
        <button className="btn primary" onClick={exportXlsx}>Xuất Excel</button>
      </div>
      <div className="toolbar">
        <div className="seg" style={{ marginBottom: 0 }}>
          <button className={by === 'faculty' ? 'on' : ''} onClick={() => { setBy('faculty'); setPage(1); }}>Theo khoa</button>
          <button className={by === 'student' ? 'on' : ''} onClick={() => { setBy('student'); setPage(1); }}>Theo sinh viên</button>
        </div>
        <label>Từ ngày <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label>Đến ngày <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card tablewrap">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && <p className="sub" style={{ margin: 0 }}>Chưa có dữ liệu trong khoảng này.</p>}
        {data && data.items.length > 0 && (
          <table>
            {data.by === 'faculty' ? (
              <>
                <thead><tr><th>Khoa</th><th>Sinh viên được cộng điểm</th><th>Số sự kiện</th><th>Tổng ĐRL</th></tr></thead>
                <tbody>{data.items.map((r) => <tr key={r.facultyId}><td>{r.faculty}</td><td>{r.studentCount}</td><td>{r.eventCount}</td><td><b>{r.totalDrl}</b></td></tr>)}</tbody>
              </>
            ) : (
              <>
                <thead><tr><th>MSSV</th><th>Họ tên</th><th>Khoa</th><th>Số sự kiện</th><th>Tổng ĐRL</th></tr></thead>
                <tbody>{data.items.map((r) => <tr key={r.mssv}><td className="mono">{r.mssv}</td><td>{r.fullName}</td><td>{r.faculty}</td><td>{r.eventCount}</td><td><b>{r.totalDrl}</b></td></tr>)}</tbody>
              </>
            )}
          </table>
        )}
        {data && <p className="sub" style={{ margin: '12px 0 0' }}>Tổng cộng: <b>{data.totalDrl}</b> điểm{data.by === 'student' ? ` · ${data.total} sinh viên` : ''}</p>}
        {data && data.by === 'student' && data.total > LIMIT && (
          <div className="pager">
            <span>Trang {data.page} / {Math.ceil(data.total / LIMIT)}</span>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
            <button className="btn" disabled={page * LIMIT >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
          </div>
        )}
      </div>
    </>
  );
}
