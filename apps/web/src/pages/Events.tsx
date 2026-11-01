// Danh sach su kien + bo loc Dang hoat dong / Da huy / Luu tru - dac ta 10
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, EventItem, Page } from '../api';
import { fmt, StatusBadge } from '../format';

const VIEWS = [
  ['active', 'Đang hoạt động'],
  ['cancelled', 'Đã hủy'],
  ['archived', 'Lưu trữ'],
] as const;

export function Events() {
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('active');
  const [data, setData] = useState<Page<EventItem> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api<Page<EventItem>>('GET', `/admin/events?view=${view}&limit=50`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được danh sách.'));
  }, [view]);

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
          <button key={key} className={view === key ? 'on' : ''} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      <div className="card">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && <p className="sub" style={{ margin: 0 }}>Chưa có sự kiện nào.</p>}
        {data && data.items.length > 0 && (
          <table>
            <thead>
              <tr><th>Tên sự kiện</th><th>Đơn vị</th><th>Bắt đầu</th><th>Điểm RL</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/su-kien/${e.id}`}>{e.title}</Link></td>
                  <td>{e.unit?.name ?? '—'}</td>
                  <td>{fmt(e.startAt)}</td>
                  <td>{e.hasDrl ? e.drlPoints : '—'}</td>
                  <td><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
