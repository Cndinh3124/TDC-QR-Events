// Nhat ky he thong (chi doc, chi Doan truong) - dac ta 8.6. Chi hien thi, khong co nut sua / xoa.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, ApiError, AuditItem, Page, qs, UserItem } from '../api';
import { fmt } from '../format';

const LIMIT = 50;

export function AuditLog() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditItem> | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      // ngay theo gio Viet Nam: tu 00:00 den 23:59:59.999
      const p = {
        action: action.trim().toUpperCase(), entity: entity.trim().toLowerCase(), page, limit: LIMIT,
        from: from ? new Date(`${from}T00:00:00+07:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59.999+07:00`).toISOString() : undefined,
      };
      setData(await api<Page<AuditItem>>('GET', `/admin/audit-logs${qs(p)}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được nhật ký.');
    }
  }, [action, entity, from, to, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    api<Page<UserItem>>('GET', '/admin/users?limit=100')
      .then((p) => setNames(Object.fromEntries(p.items.map((u) => [u.id, u.fullName]))))
      .catch(() => {});
  }, []);

  const reset = () => setPage(1);
  return (
    <>
      <h1>Nhật ký hệ thống</h1>
      <p className="sub">Ghi lại mọi thao tác quản trị. Chỉ đọc, không thể sửa hay xóa.</p>
      <div className="toolbar">
        <input placeholder="Hành động (vd. EVENT_CANCEL)" value={action} onChange={(e) => { setAction(e.target.value); reset(); }} />
        <input placeholder="Đối tượng (vd. event)" value={entity} onChange={(e) => { setEntity(e.target.value); reset(); }} />
        <label>Từ ngày <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); reset(); }} /></label>
        <label>Đến ngày <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); reset(); }} /></label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card tablewrap">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && <p className="sub" style={{ margin: 0 }}>Không có bản ghi nào.</p>}
        {data && data.items.length > 0 && (
          <table>
            <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Lý do</th><th></th></tr></thead>
            <tbody>{data.items.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td>{fmt(r.createdAt)}</td>
                  <td>{r.actorId ? names[r.actorId] ?? <span className="mono">{r.actorId.slice(0, 8)}</span> : 'Hệ thống'}</td>
                  <td className="mono">{r.action}</td>
                  <td>{r.entity}{r.entityId && <><br /><span className="mono">{r.entityId.slice(0, 8)}</span></>}</td>
                  <td style={{ maxWidth: 280 }}>{r.reason ?? '—'}</td>
                  <td>{(r.beforeJson != null || r.afterJson != null) && <button className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Ẩn' : 'Chi tiết'}</button>}</td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={6}>
                    {r.beforeJson != null && <><b>Trước</b><pre className="audit-detail">{JSON.stringify(r.beforeJson, null, 2)}</pre></>}
                    {r.afterJson != null && <><b>Sau</b><pre className="audit-detail">{JSON.stringify(r.afterJson, null, 2)}</pre></>}
                    {r.ip && <p className="sub" style={{ margin: '8px 0 0' }}>IP: {r.ip}</p>}
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
        )}
        {data && data.total > LIMIT && (
          <div className="pager">
            <span>Trang {data.page} / {Math.ceil(data.total / LIMIT)} ({data.total} bản ghi)</span>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
            <button className="btn" disabled={page * LIMIT >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
          </div>
        )}
      </div>
    </>
  );
}
