// Man duyet luot diem danh cua mot su kien: loc, duyet / tu choi, hang loat, them / sua / huy, chot - dac ta 3.6, 3.7
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, AttendanceRow, AttendanceSummary, EventItem, Page, qs } from '../api';
import { useAuth } from '../auth';
import { AttendanceForm } from '../components/AttendanceForm';
import { Dialog } from '../components/Dialog';
import { ReasonDialog } from '../components/ReasonDialog';
import { FLAG_LABEL, fmt, REVIEW_LABEL, StatusBadge } from '../format';

type Dlg =
  | { kind: 'reject'; row: AttendanceRow }
  | { kind: 'void'; row: AttendanceRow }
  | { kind: 'restore'; row: AttendanceRow }
  | { kind: 'edit'; row: AttendanceRow }
  | { kind: 'bulkReject' }
  | { kind: 'bulkVoid' }
  | { kind: 'manual' }
  | { kind: 'finalize' }
  | { kind: 'unlock' }
  | { kind: 'detail'; row: AttendanceRow };

const TABS: Array<[string, string]> = [['', 'Tất cả'], ['PENDING', 'Chờ duyệt'], ['APPROVED', 'Đã duyệt'], ['REJECTED', 'Từ chối'], ['VOIDED', 'Đã hủy']];
const LIMIT = 50;

export function Review() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [ev, setEv] = useState<EventItem | null>(null);
  const [sum, setSum] = useState<AttendanceSummary | null>(null);
  const [data, setData] = useState<Page<AttendanceRow> | null>(null);
  const [tab, setTab] = useState('');
  const [flagged, setFlagged] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadEvent = useCallback(async () => {
    try {
      setEv(await api<EventItem>('GET', `/admin/events/${id}`));
      setSum(await api<AttendanceSummary>('GET', `/admin/events/${id}/attendances/summary`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được sự kiện.');
    }
  }, [id]);

  const loadList = useCallback(async () => {
    const query = qs({
      page, limit: LIMIT, q: q.trim() || undefined, flagged: flagged || undefined,
      review: tab && tab !== 'VOIDED' ? tab : undefined, voided: tab === 'VOIDED' ? 'only' : undefined,
    });
    try {
      setData(await api<Page<AttendanceRow>>('GET', `/admin/events/${id}/attendances${query}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được danh sách.');
    }
  }, [id, page, q, flagged, tab]);

  useEffect(() => { loadEvent(); }, [loadEvent]);
  useEffect(() => { loadList(); }, [loadList]);

  const refresh = async () => {
    setSel(new Set());
    await Promise.all([loadEvent(), loadList()]);
  };

  // bao loi chung cho cac thao tac khong qua hop thoai
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Thao tác không thành công.');
    } finally {
      setBusy(false);
    }
  }

  if (!ev) return error ? <div className="error">{error}</div> : <p>Đang tải…</p>;

  const finalized = ev.status === 'FINALIZED';
  const reviewable = ev.canManage && ev.checkinState === 'CLOSED' && ['PUBLISHED', 'CHECKIN_CLOSED', 'REVIEWING'].includes(ev.status);
  const mutable = ev.canManage && !['DRAFT', 'CANCELLED', 'FINALIZED'].includes(ev.status);
  const ids = [...sel];

  const reviewOne = (row: AttendanceRow, status: string, reason?: string) =>
    api('PATCH', `/admin/attendances/${row.id}/review`, { status, ...(reason ? { reason } : {}) });
  const bulk = (action: string, reason?: string) =>
    api('POST', '/admin/attendances/bulk', { eventId: id, action, ...(action === 'APPROVE_CLEAN' ? {} : { ids }), ...(reason ? { reason } : {}) });

  return (
    <>
      <p className="sub"><Link to={`/su-kien/${id}`}>← {ev.title}</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Duyệt điểm danh</h1>
          <p className="sub"><StatusBadge status={ev.status} /> · {ev.hasDrl ? `${ev.drlPoints} điểm rèn luyện` : 'Không cộng điểm'}{ev.requireCheckout ? ' · Bắt buộc điểm danh ra' : ''}</p>
        </div>
        <div className="row">
          {mutable && <button className="btn" onClick={() => setDlg({ kind: 'manual' })}>+ Thêm thủ công</button>}
          {reviewable && sum && sum.cleanPending > 0 && (
            <button className="btn" disabled={busy} onClick={() => run(() => bulk('APPROVE_CLEAN'))}>Duyệt {sum.cleanPending} lượt sạch</button>
          )}
          {reviewable && <button className="btn primary" disabled={busy || (sum?.pending ?? 0) > 0} title={(sum?.pending ?? 0) > 0 ? 'Còn lượt chưa duyệt' : ''} onClick={() => setDlg({ kind: 'finalize' })}>Chốt sự kiện</button>}
          {finalized && user?.role === 'SCHOOL_ADMIN' && <button className="btn danger" onClick={() => setDlg({ kind: 'unlock' })}>Mở khóa</button>}
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {ev.checkinState === 'OPEN' && <div className="notice">Sự kiện đang mở điểm danh. Hãy đóng điểm danh trước khi duyệt.</div>}
      {finalized && <div className="notice">Sự kiện đã chốt: dữ liệu bị khóa. Chỉ Đoàn trường mở khóa được, hoặc xử lý qua khiếu nại còn hạn.</div>}

      {sum && (
        <div className="stats">
          <div className="stat"><b>{sum.total}</b><span>Tổng lượt (không tính đã hủy)</span></div>
          <div className="stat"><b>{sum.pending}</b><span>Chờ duyệt ({sum.cleanPending} sạch)</span></div>
          <div className="stat"><b>{sum.approved}</b><span>Đã duyệt</span></div>
          <div className="stat"><b>{sum.flagged}</b><span>Bị gắn cờ{ev.requireCheckout ? ` · ${sum.noCheckout} chưa ra` : ''}</span></div>
        </div>
      )}

      <div className="toolbar">
        <div className="seg" style={{ marginBottom: 0 }}>
          {TABS.map(([k, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setPage(1); }}>{label}</button>)}
        </div>
        <select value={flagged} onChange={(e) => { setFlagged(e.target.value); setPage(1); }} aria-label="Lọc theo cờ">
          <option value="">Mọi lượt</option><option value="yes">Có cờ</option><option value="no">Không cờ</option>
        </select>
        <input placeholder="Tìm MSSV hoặc họ tên" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      {sel.size > 0 && reviewable && (
        <div className="bulkbar">
          <b>Đã chọn {sel.size}</b>
          <button className="btn primary" disabled={busy} onClick={() => run(() => bulk('APPROVE'))}>Duyệt</button>
          <button className="btn" onClick={() => setDlg({ kind: 'bulkReject' })}>Từ chối</button>
          <button className="btn danger" onClick={() => setDlg({ kind: 'bulkVoid' })}>Hủy lượt</button>
          <button className="link" onClick={() => setSel(new Set())}>Bỏ chọn</button>
        </div>
      )}

      <div className="card tablewrap">
        {!data && <p>Đang tải…</p>}
        {data && data.items.length === 0 && <p className="sub" style={{ margin: 0 }}>Không có lượt điểm danh nào.</p>}
        {data && data.items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>{reviewable && <input type="checkbox" aria-label="Chọn tất cả" checked={data.items.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(data.items.filter((r) => !r.voidedAt).map((r) => r.id)) : new Set())} />}</th>
                <th>MSSV</th><th>Họ tên</th><th>Khoa</th><th>Vào / Ra</th><th>Trạng thái</th><th>Cờ</th><th>Điểm</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => {
                const [label, tone] = REVIEW_LABEL[r.reviewStatus];
                return (
                  <tr key={r.id} style={r.voidedAt ? { opacity: 0.55 } : undefined}>
                    <td>{reviewable && !r.voidedAt && <input type="checkbox" aria-label={`Chọn ${r.mssv}`} checked={sel.has(r.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />}</td>
                    <td className="mono">{r.mssv}</td>
                    <td><button className="link" onClick={() => setDlg({ kind: 'detail', row: r })}>{r.fullName}</button></td>
                    <td>{r.faculty?.name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(r.checkinAt)}{r.checkoutAt ? <><br />{fmt(r.checkoutAt)}</> : ''}</td>
                    <td>{r.voidedAt ? <span className="badge draft">Đã hủy</span> : <span className={`badge ${tone}`}>{label}</span>}</td>
                    <td>{r.flags.map((f) => <span key={f.code} className={`flag ${f.code === 'MANUAL_ENTRY' ? 'info' : ''}`}>{FLAG_LABEL[f.code] ?? f.code}</span>)}</td>
                    <td>{r.drlAwarded ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {reviewable && !r.voidedAt && r.reviewStatus !== 'APPROVED' && <button className="link" disabled={busy} onClick={() => run(() => reviewOne(r, 'APPROVED'))}>Duyệt</button>}{' '}
                      {reviewable && !r.voidedAt && r.reviewStatus !== 'REJECTED' && <button className="link danger" onClick={() => setDlg({ kind: 'reject', row: r })}>Từ chối</button>}{' '}
                      {mutable && !r.voidedAt && <button className="link" onClick={() => setDlg({ kind: 'edit', row: r })}>Sửa</button>}{' '}
                      {mutable && !r.voidedAt && <button className="link danger" onClick={() => setDlg({ kind: 'void', row: r })}>Hủy</button>}
                      {mutable && r.voidedAt && <button className="link" onClick={() => setDlg({ kind: 'restore', row: r })}>Khôi phục</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {data && data.total > LIMIT && (
          <div className="pager">
            <span>Trang {data.page} / {Math.ceil(data.total / LIMIT)} ({data.total} lượt)</span>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
            <button className="btn" disabled={page * LIMIT >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
          </div>
        )}
      </div>

      {dlg?.kind === 'reject' && (
        <ReasonDialog title={`Từ chối ${dlg.row.fullName}`} confirmText="Từ chối" danger onClose={() => setDlg(null)}
          onSubmit={async (reason) => { await reviewOne(dlg.row, 'REJECTED', reason); await refresh(); }} />
      )}
      {dlg?.kind === 'void' && (
        <ReasonDialog title={`Hủy lượt của ${dlg.row.fullName}`} confirmText="Hủy lượt" danger onClose={() => setDlg(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/attendances/${dlg.row.id}/void`, { reason }); await refresh(); }} />
      )}
      {dlg?.kind === 'restore' && (
        <ReasonDialog title={`Khôi phục lượt của ${dlg.row.fullName}`} confirmText="Khôi phục" onClose={() => setDlg(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/attendances/${dlg.row.id}/restore`, { reason }); await refresh(); }} />
      )}
      {dlg?.kind === 'bulkReject' && (
        <ReasonDialog title={`Từ chối ${sel.size} lượt`} confirmText="Từ chối" danger onClose={() => setDlg(null)}
          onSubmit={async (reason) => { await bulk('REJECT', reason); await refresh(); }} />
      )}
      {dlg?.kind === 'bulkVoid' && (
        <ReasonDialog title={`Hủy ${sel.size} lượt`} confirmText="Hủy lượt" danger onClose={() => setDlg(null)}
          onSubmit={async (reason) => { await bulk('VOID', reason); await refresh(); }} />
      )}
      {dlg?.kind === 'unlock' && (
        <ReasonDialog title="Mở khóa sự kiện đã chốt" label="Lý do mở khóa" confirmText="Mở khóa" danger onClose={() => setDlg(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/events/${id}/unlock`, { reason }); await refresh(); }} />
      )}
      {dlg?.kind === 'manual' && <AttendanceForm eventId={id} requireCheckout={ev.requireCheckout} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg?.kind === 'edit' && <AttendanceForm eventId={id} requireCheckout={ev.requireCheckout} row={dlg.row} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg?.kind === 'finalize' && (
        <Dialog title="Chốt sự kiện" onClose={() => setDlg(null)}>
          <p>Chốt sẽ <b>khóa dữ liệu</b> và ghi nhận {ev.hasDrl ? `${ev.drlPoints} điểm rèn luyện` : 'kết quả'} cho các lượt đã duyệt{ev.requireCheckout ? ' (có điểm danh ra)' : ''}. Mỗi sinh viên chỉ được cộng một lần.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setDlg(null)}>Hủy</button>
            <button className="btn primary" onClick={() => { setDlg(null); run(() => api('POST', `/admin/events/${id}/finalize`)); }}>Chốt sự kiện</button>
          </div>
        </Dialog>
      )}
      {dlg?.kind === 'detail' && (
        <Dialog title={dlg.row.fullName} onClose={() => setDlg(null)}>
          <table><tbody>
            <tr><td>MSSV</td><td className="mono">{dlg.row.mssv}</td></tr>
            <tr><td>Khoa</td><td>{dlg.row.faculty?.name}</td></tr>
            <tr><td>Email</td><td>{dlg.row.email ?? '—'}</td></tr>
            <tr><td>Giờ vào</td><td>{fmt(dlg.row.checkinAt)} · {dlg.row.timeliness === 'ON_TIME' ? 'Đúng giờ' : 'Trễ giờ'}</td></tr>
            <tr><td>Giờ ra</td><td>{dlg.row.checkoutAt ? fmt(dlg.row.checkoutAt) : '—'}</td></tr>
            <tr><td>Nguồn</td><td>{dlg.row.source === 'MANUAL' ? 'Thêm thủ công' : 'Sinh viên tự điểm danh'}{dlg.row.deviceRef ? ` · máy ${dlg.row.deviceRef}` : ''}</td></tr>
            <tr><td>Khoảng cách</td><td>{dlg.row.distanceM === null ? '—' : `${dlg.row.distanceM} m`}</td></tr>
            <tr><td>Mã xác nhận</td><td className="mono">{dlg.row.confirmCode ?? 'Ẩn'}</td></tr>
            <tr><td>Số lần sửa</td><td>{dlg.row.editCount}</td></tr>
            {dlg.row.reviewNote && <tr><td>Ghi chú duyệt</td><td>{dlg.row.reviewNote}</td></tr>}
            {dlg.row.voidReason && <tr><td>Lý do hủy</td><td>{dlg.row.voidReason}</td></tr>}
            <tr><td>Cờ</td><td>{dlg.row.flags.length ? dlg.row.flags.map((f) => FLAG_LABEL[f.code] ?? f.code).join(', ') : 'Không có'}</td></tr>
          </tbody></table>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" onClick={() => setDlg(null)}>Đóng</button></div>
        </Dialog>
      )}
    </>
  );
}
