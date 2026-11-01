// Tab "Nhat ky": cac thao tac cua rieng su kien nay (chi doc, chi Doan truong xem duoc nhat ky he thong)
import { useEffect, useState } from 'react';
import { api, AuditItem, Page, qs } from '../../api';
import { fmt } from '../../format';

const LABEL: Record<string, string> = {
  EVENT_CREATE: 'Tạo sự kiện', EVENT_UPDATE: 'Sửa thông tin', EVENT_PUBLISH: 'Công bố', EVENT_OPEN: 'Mở điểm danh',
  EVENT_CLOSE: 'Đóng điểm danh', EVENT_AUTO: 'Quay lại điều khiển theo giờ', EVENT_CANCEL: 'Hủy sự kiện',
  EVENT_ARCHIVE: 'Lưu trữ', EVENT_RESTORE: 'Khôi phục', EVENT_DELETE: 'Xóa', EVENT_DUPLICATE: 'Nhân bản',
  EVENT_FACULTY_VIEW: 'Đổi quyền xem của các khoa', EVENT_QR_ROTATE: 'Tạo mã QR mới', EVENT_CODE_ROTATE: 'Đổi mã 4 số',
  EVENT_FINALIZED: 'Chốt sự kiện', EVENT_UNLOCK: 'Mở khóa sự kiện đã chốt',
};

export function LogPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Page<AuditItem> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Page<AuditItem>>('GET', `/admin/audit-logs${qs({ entity: 'event', entityId: eventId, limit: 50 })}`)
      .then(setData)
      .catch(() => setError('Không tải được nhật ký.'));
  }, [eventId]);
  if (error) return <div className="error">{error}</div>;
  if (!data) return <p>Đang tải…</p>;
  return (
    <div className="card">
      {data.items.length === 0 ? <p className="sub" style={{ margin: 0 }}>Chưa có thao tác nào được ghi nhận.</p> : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Thời điểm</th><th>Thao tác</th><th>Lý do</th></tr></thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l.id}><td>{fmt(l.createdAt)}</td><td>{LABEL[l.action] ?? l.action}</td><td>{l.reason ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
