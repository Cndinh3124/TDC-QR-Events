// Tab "Ma QR": QR vao / ra, tai PDF / PNG, tao ma moi, doi ma 4 so - dac ta 3.2, 5.2
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, EventItem, fetchBlobUrl, QrInfo, download } from '../../api';
import { ReasonDialog } from '../../components/ReasonDialog';

interface QrData {
  checkin: QrInfo | null;
  checkout: QrInfo | null;
  hasVerifyCode: boolean;
}

function QrImage({ eventId, purpose, version }: { eventId: string; purpose: 'CHECKIN' | 'CHECKOUT'; version: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '';
    fetchBlobUrl(`/admin/events/${eventId}/qr.png?purpose=${purpose}`).then((u) => {
      url = u;
      setSrc(u);
    }).catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
    // version doi khi tao ma moi -> tai lai anh
  }, [eventId, purpose, version]);
  return src ? <img src={src} alt={`Mã QR điểm danh ${purpose === 'CHECKIN' ? 'vào' : 'ra'}`} /> : <p>Đang tải mã QR…</p>;
}

interface Props {
  ev: EventItem;
  verifyCode: string | null;
  onVerifyCode: (code: string) => void;
}

export function QrPanel({ ev, verifyCode, onVerifyCode }: Props) {
  const [qr, setQr] = useState<QrData | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'CHECKIN' | 'CHECKOUT' | 'code' | null>(null);

  const load = () => api<QrData>('GET', `/admin/events/${ev.id}/qr`).then(setQr).catch(() => setQr(null));
  useEffect(() => { if (ev.canManage && ev.status !== 'DRAFT' && ev.status !== 'CANCELLED') load(); }, [ev.id, ev.status, ev.canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ev.canManage) return <div className="card"><p className="sub" style={{ margin: 0 }}>Mã QR là bí mật của đơn vị tổ chức nên bạn không xem được.</p></div>;
  if (ev.status === 'DRAFT') return <div className="card"><p className="sub" style={{ margin: 0 }}>Công bố sự kiện để tạo mã QR.</p></div>;
  if (ev.status === 'CANCELLED' || ev.archivedAt) return <div className="card"><p className="sub" style={{ margin: 0 }}>Sự kiện đã hủy hoặc lưu trữ, mã QR không còn dùng được.</p></div>;

  const file = async (purpose: 'CHECKIN' | 'CHECKOUT', ext: 'pdf' | 'png') => {
    try {
      await download(`/admin/events/${ev.id}/qr.${ext}?purpose=${purpose}`, `qr-${purpose.toLowerCase()}.${ext}`);
    } catch {
      setError('Không tải được tệp.');
    }
  };

  const card = (purpose: 'CHECKIN' | 'CHECKOUT', info: QrInfo) => (
    <div className="card qr" key={purpose}>
      <h2>Mã QR điểm danh {purpose === 'CHECKIN' ? 'vào' : 'ra'}</h2>
      <QrImage eventId={ev.id} purpose={purpose} version={info.token} />
      <p className="mono" style={{ wordBreak: 'break-all' }}>{info.url}</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => file(purpose, 'pdf')}>Tải PDF để in (A4)</button>
        <button className="btn" onClick={() => file(purpose, 'png')}>Tải ảnh PNG</button>
        <button className="btn danger" onClick={() => setDialog(purpose)}>Tạo mã mới</button>
      </div>
    </div>
  );

  return (
    <>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <span>Chiếu mã QR toàn màn hình tại hội trường, kèm số người đã điểm danh và đếm ngược.</span>
        <Link to={`/trinh-chieu/${ev.id}`} state={{ verifyCode }} className="btn primary">Mở trình chiếu</Link>
      </div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        {qr?.checkin && card('CHECKIN', qr.checkin)}
        {qr?.checkout && card('CHECKOUT', qr.checkout)}
      </div>
      {!qr && <p>Đang tải…</p>}

      {ev.controlLevel === 'TIGHT' && (
        <div className="card">
          <h2>Mã xác nhận 4 số</h2>
          {verifyCode ? (
            <div className="notice">Mã hiện tại: <b className="mono" style={{ fontSize: 22 }}>{verifyCode}</b> — chỉ hiện một lần, hãy ghi lại để đọc cho sinh viên tại chỗ.</div>
          ) : (
            <p className="sub">Sinh viên nhập mã này ở bước điểm danh ra. Hệ thống chỉ lưu giá trị mã hóa nên không xem lại được mã cũ; quên mã thì đổi mã mới.</p>
          )}
          <button className="btn" onClick={() => setDialog('code')}>Đổi mã 4 số</button>
        </div>
      )}

      {(dialog === 'CHECKIN' || dialog === 'CHECKOUT') && (
        <ReasonDialog
          title={`Tạo mã QR điểm danh ${dialog === 'CHECKIN' ? 'vào' : 'ra'} mới`}
          confirmText="Tạo mã mới"
          danger
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            await api('POST', `/admin/events/${ev.id}/qr/rotate`, { purpose: dialog, reason });
            await load();
          }}
          extra={<div className="error">Mã cũ hết hiệu lực ngay. Mọi tờ QR đã in và đã dán sẽ không dùng được nữa.</div>}
        />
      )}
      {dialog === 'code' && (
        <ReasonDialog
          title="Đổi mã xác nhận 4 số"
          confirmText="Đổi mã"
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            const r = await api<{ verifyCode: string }>('POST', `/admin/events/${ev.id}/verify-code/rotate`, { reason });
            onVerifyCode(r.verifyCode);
          }}
        />
      )}
    </>
  );
}
