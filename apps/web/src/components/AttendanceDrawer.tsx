// Ngan keo ben phai: chi tiet mot luot diem danh, lich su sua, cac su kien khac cua cung MSSV - dac ta A07
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, AttendanceDetail, AttendanceRow } from '../api';
import { FLAG_LABEL, fmt, REVIEW_LABEL } from '../format';

const FIELD_LABEL: Record<string, string> = {
  mssv: 'MSSV', fullName: 'Họ tên', email: 'Email', facultyUnitId: 'Khoa', checkinAt: 'Giờ vào', checkoutAt: 'Giờ ra',
  reviewStatus: 'Trạng thái duyệt', voidedAt: 'Hủy lượt',
};
const TIME_FIELDS = new Set(['checkinAt', 'checkoutAt', 'voidedAt']);

function showValue(field: string, v: string | null): string {
  if (v === null || v === '') return '—';
  if (TIME_FIELDS.has(field)) return fmt(v);
  if (field === 'reviewStatus') return REVIEW_LABEL[v]?.[0] ?? v;
  return v;
}

export function AttendanceDrawer({ row, onClose }: { row: AttendanceRow; onClose: () => void }) {
  const [data, setData] = useState<AttendanceDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    api<AttendanceDetail>('GET', `/admin/attendances/${row.id}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Không tải được chi tiết lượt điểm danh.'));
    return () => { alive = false; };
  }, [row.id]);

  // hien ngay thong tin co san tu dong trong bang, cap nhat khi tai xong
  const a = data?.attendance ?? row;

  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Chi tiết lượt điểm danh của ${a.fullName}`}>
        <div className="drawer-head">
          <div>
            <h2>{a.fullName}</h2>
            <p className="sub mono" style={{ margin: 0 }}>{a.mssv}</p>
          </div>
          <button className="btn" onClick={onClose}>Đóng</button>
        </div>

        <dl className="kv">
          <dt>Khoa</dt><dd>{a.faculty?.name ?? '—'}</dd>
          <dt>Email</dt><dd>{a.email ?? '—'}</dd>
          <dt>Giờ vào</dt><dd>{fmt(a.checkinAt)} · {a.timeliness === 'ON_TIME' ? 'Đúng giờ' : 'Trễ giờ'}</dd>
          <dt>Giờ ra</dt><dd>{a.checkoutAt ? fmt(a.checkoutAt) : '—'}</dd>
          <dt>Nguồn</dt><dd>{a.source === 'MANUAL' ? 'Thêm thủ công' : 'Sinh viên tự điểm danh'}{a.deviceRef ? ` · máy ${a.deviceRef}` : ''}</dd>
          <dt>Khoảng cách</dt><dd>{a.distanceM === null ? '—' : `${a.distanceM} m`}</dd>
          <dt>Mã xác nhận</dt><dd className="mono">{a.confirmCode ?? 'Ẩn'}</dd>
          <dt>Trạng thái</dt>
          <dd>{a.voidedAt ? `Đã hủy${a.voidReason ? `: ${a.voidReason}` : ''}` : REVIEW_LABEL[a.reviewStatus][0]}{a.reviewNote ? ` · ${a.reviewNote}` : ''}</dd>
          <dt>Điểm</dt><dd>{a.drlAwarded ?? '—'}</dd>
          <dt>Cờ</dt>
          <dd>{a.flags.length ? a.flags.map((f) => <span key={f.code} className={`flag ${f.code === 'MANUAL_ENTRY' ? 'info' : ''}`}>{FLAG_LABEL[f.code] ?? f.code}</span>) : 'Không có'}</dd>
        </dl>

        {error && <div className="error" role="alert">{error}</div>}
        {!data && !error && <p className="sub">Đang tải lịch sử…</p>}

        {data && (
          <>
            <h3>Lịch sử sửa ({data.edits.length})</h3>
            {data.edits.length === 0 && <p className="sub">Chưa sửa lần nào.</p>}
            {data.edits.length > 0 && (
              <ul className="timeline">
                {data.edits.map((e, i) => (
                  <li key={i}>
                    <div className="when">{fmt(e.at)} · {e.actorType === 'ADMIN' ? (e.actorName ?? 'Quản trị') : 'Sinh viên tự sửa'}</div>
                    {e.changes.map((c) => (
                      <div key={c.field}>{FIELD_LABEL[c.field] ?? c.field}: <s>{showValue(c.field, c.from)}</s> → <b>{showValue(c.field, c.to)}</b></div>
                    ))}
                    {e.reason && <div className="sub">Lý do: {e.reason}</div>}
                  </li>
                ))}
              </ul>
            )}

            <h3>Sự kiện khác của MSSV này ({data.otherAttendances.length})</h3>
            {data.otherAttendances.length === 0 && <p className="sub">Không có sự kiện nào khác bạn được xem.</p>}
            {data.otherAttendances.length > 0 && (
              <table>
                <thead><tr><th>Sự kiện</th><th>Giờ vào</th><th>Trạng thái</th><th>Điểm</th></tr></thead>
                <tbody>
                  {data.otherAttendances.map((o) => (
                    <tr key={o.attendanceId} style={o.voided ? { opacity: 0.55 } : undefined}>
                      <td>
                        <Link to={`/su-kien/${o.eventId}/duyet`} onClick={onClose}>{o.eventTitle}</Link>
                        {o.mssv !== a.mssv && <div className="sub mono">MSSV gộp: {o.mssv}</div>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmt(o.checkinAt)}</td>
                      <td>{o.voided ? 'Đã hủy' : REVIEW_LABEL[o.reviewStatus][0]}</td>
                      <td>{o.drlAwarded ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
