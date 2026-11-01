// Xu ly khieu nai: danh sach theo han, chap nhan (tao luot / duyet luot co san) hoac tu choi - dac ta 3.5
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, AppealItem, AppealStatus, Page, qs } from '../api';
import { AttendanceForm } from '../components/AttendanceForm';
import { Dialog } from '../components/Dialog';
import { APPEAL_TYPE_LABEL, fmt } from '../format';

const TABS: Array<[AppealStatus | '', string]> = [['PENDING', 'Chờ xử lý'], ['ACCEPTED', 'Đã chấp nhận'], ['REJECTED', 'Đã từ chối'], ['', 'Tất cả']];
const TONE: Record<AppealStatus, [string, string]> = { PENDING: ['Chờ xử lý', 'wait'], ACCEPTED: ['Chấp nhận', 'ok'], REJECTED: ['Từ chối', 'err'] };

const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

export function Appeals() {
  const [status, setStatus] = useState<AppealStatus | ''>('PENDING');
  const [data, setData] = useState<Page<AppealItem> | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<AppealItem | null>(null);
  const [creating, setCreating] = useState<AppealItem | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api<Page<AppealItem>>('GET', `/admin/appeals${qs({ status: status || undefined, limit: 50 })}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được danh sách.');
    }
  }, [status]);

  useEffect(() => { setData(null); load(); }, [load]);

  return (
    <>
      <h1>Khiếu nại</h1>
      <p className="sub">Sinh viên gửi trong 7 ngày sau khi sự kiện kết thúc. Khiếu nại gần hết hạn xử lý được xếp lên đầu.</p>
      <div className="seg">{TABS.map(([k, label]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{label}</button>)}</div>
      {error && <div className="error">{error}</div>}
      <div className="card tablewrap">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && <p className="sub" style={{ margin: 0 }}>Không có khiếu nại nào.</p>}
        {data && data.items.length > 0 && (
          <table>
            <thead><tr><th>Sinh viên</th><th>Sự kiện</th><th>Loại / nội dung</th><th>Hạn</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {data.items.map((a) => {
                const [label, tone] = TONE[a.status];
                return (
                  <tr key={a.id}>
                    <td><b>{a.fullName ?? '—'}</b><br /><span className="mono">{a.mssv}</span></td>
                    <td><Link to={`/su-kien/${a.event.id}/duyet`}>{a.event.title}</Link></td>
                    <td style={{ maxWidth: 360 }}><b>{APPEAL_TYPE_LABEL[a.type]}</b><br />{a.content}{a.resolutionNote && <><br /><i>Xử lý: {a.resolutionNote}</i></>}</td>
                    <td>{a.status === 'PENDING' ? `${fmt(a.deadlineAt)} (${daysLeft(a.deadlineAt) > 0 ? `còn ${daysLeft(a.deadlineAt)} ngày` : 'quá hạn'})` : '—'}</td>
                    <td><span className={`badge ${tone}`}>{label}</span></td>
                    <td>{a.status === 'PENDING' && <button className="btn" onClick={() => setTarget(a)}>Xử lý</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {target && <HandleDialog appeal={target} onClose={() => setTarget(null)} onDone={load} onCreate={() => { setCreating(target); setTarget(null); }} />}
      {creating && (
        <AttendanceForm
          eventId={creating.event.id} requireCheckout title="Tạo lượt điểm danh từ khiếu nại" askReason={false}
          preset={{ mssv: creating.mssv, fullName: creating.fullName ?? '', facultyUnitId: '' }}
          onClose={() => setCreating(null)} onDone={load}
          submit={async (fields) => { await api('PATCH', `/admin/appeals/${creating.id}`, { action: 'ACCEPT', note: `Tạo lượt điểm danh theo khiếu nại`, attendance: { ...fields } }); }}
        />
      )}
    </>
  );
}

function HandleDialog({ appeal, onClose, onDone, onCreate }: { appeal: AppealItem; onClose: () => void; onDone: () => void; onCreate: () => void }) {
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'REJECT' | 'NOTE' | 'APPROVE'>(appeal.attendanceId ? 'APPROVE' : 'NOTE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('PATCH', `/admin/appeals/${appeal.id}`, {
        action: mode === 'REJECT' ? 'REJECT' : 'ACCEPT', note: note.trim(), ...(mode === 'APPROVE' ? { approveAttendance: true } : {}),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Khiếu nại của ${appeal.fullName ?? appeal.mssv}`} onClose={onClose}>
      <p><b>{APPEAL_TYPE_LABEL[appeal.type]}</b><br />{appeal.content}</p>
      <form onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        <label className="check"><input type="radio" checked={mode === 'REJECT'} onChange={() => setMode('REJECT')} /> Từ chối khiếu nại</label>
        {appeal.attendanceId && <label className="check"><input type="radio" checked={mode === 'APPROVE'} onChange={() => setMode('APPROVE')} /> Chấp nhận và duyệt lượt điểm danh đã có (khôi phục nếu đang bị hủy)</label>}
        <label className="check"><input type="radio" checked={mode === 'NOTE'} onChange={() => setMode('NOTE')} /> Chấp nhận, chỉ ghi nhận (đã sửa ở nơi khác)</label>
        {!appeal.attendanceId && <p className="sub">Sinh viên chưa có lượt điểm danh: <button type="button" className="link" onClick={onCreate}>tạo lượt điểm danh từ khiếu nại này</button>.</p>}
        <label className="field"><span>Ghi chú xử lý * (sinh viên sẽ thấy)</span>
          <textarea rows={3} required minLength={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className={`btn ${mode === 'REJECT' ? 'danger' : 'primary'}`} disabled={busy}>{busy ? 'Đang xử lý…' : mode === 'REJECT' ? 'Từ chối' : 'Chấp nhận'}</button>
        </div>
      </form>
    </Dialog>
  );
}
