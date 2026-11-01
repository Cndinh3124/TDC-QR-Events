// Thong bao trong he thong (dac ta quan-ly-hoat-dong 4.3, A20): bam vao de mo ho so, danh dau da doc.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, NotificationItem, Page, qs } from '../api';
import { Pagination } from '../components/Pagination';
import { fmt } from '../format';

const PAGE_SIZE = 20;

export function Notifications() {
  const nav = useNavigate();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page<NotificationItem> & { unread: number }) | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Page<NotificationItem> & { unread: number }>('GET', `/admin/notifications${qs({ unread: onlyUnread ? 'true' : '', page, limit: PAGE_SIZE })}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được thông báo.'));
  }, [onlyUnread, page]);

  useEffect(load, [load]);

  async function open(n: NotificationItem) {
    if (!n.read) await api('POST', `/admin/notifications/${n.id}/read`).catch(() => {});
    window.dispatchEvent(new Event('notifications-changed'));
    if (n.entityType === 'activity' && n.entityId) nav(`/hoat-dong/${n.entityId}`);
    else load();
  }

  async function readAll() {
    await api('POST', '/admin/notifications/read-all');
    window.dispatchEvent(new Event('notifications-changed'));
    load();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Thông báo</h1>
          <p className="sub">{data ? `${data.unread} thông báo chưa đọc` : ' '}</p>
        </div>
        <button className="btn" disabled={!data || data.unread === 0} onClick={readAll}>Đánh dấu đã đọc tất cả</button>
      </div>
      <div className="seg">
        <button className={!onlyUnread ? 'on' : ''} onClick={() => { setOnlyUnread(false); setPage(1); }}>Tất cả</button>
        <button className={onlyUnread ? 'on' : ''} onClick={() => { setOnlyUnread(true); setPage(1); }}>Chưa đọc</button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="card">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && <p className="sub" style={{ margin: 0 }}>{onlyUnread ? 'Không còn thông báo chưa đọc.' : 'Chưa có thông báo nào.'}</p>}
        <ul className="notif">
          {data?.items.map((n) => (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              <button onClick={() => open(n)}>
                <span>{n.message}</span>
                <small>{fmt(n.createdAt)}</small>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {data && <Pagination page={page} total={data.total} limit={PAGE_SIZE} onPage={setPage} />}
    </>
  );
}
