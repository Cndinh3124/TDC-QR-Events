// Ho so sinh vien: tim, xem lich su va DRL, sua ten / khoa, gop MSSV trung (Doan truong) - dac ta 3.7
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, Page, StudentHistoryItem, StudentItem, Unit } from '../api';
import { useAuth } from '../auth';
import { Dialog } from '../components/Dialog';
import { ReasonDialog } from '../components/ReasonDialog';
import { fmt, REVIEW_LABEL } from '../format';

const LIMIT = 50;

export function Students() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<StudentItem> | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (q.trim()) p.set('q', q.trim());
    try {
      setData(await api<Page<StudentItem>>('GET', `/admin/students?${p}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được danh sách.');
    }
  }, [q, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <>
      <h1>Sinh viên</h1>
      <p className="sub">Hồ sơ tự hình thành khi sinh viên điểm danh. Tổng điểm chỉ tính sự kiện đã chốt.</p>
      <div className="toolbar"><input placeholder="Tìm MSSV hoặc họ tên" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      {error && <div className="error">{error}</div>}
      <div className="card tablewrap">
        {!data && !error && <p>Đang tải…</p>}
        {data && data.items.length === 0 && <p className="sub" style={{ margin: 0 }}>Không có sinh viên nào.</p>}
        {data && data.items.length > 0 && (
          <table>
            <thead><tr><th>MSSV</th><th>Họ tên</th><th>Khoa</th><th>Số sự kiện</th><th>Tổng ĐRL</th></tr></thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.mssv}>
                  <td className="mono"><button className="link mono" onClick={() => setOpen(s.mssv)}>{s.mssv}</button></td>
                  <td>{s.fullName}</td><td>{s.faculty?.name}</td><td>{s.attendanceCount}</td><td><b>{s.totalDrl}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.total > LIMIT && (
          <div className="pager">
            <span>Trang {data.page} / {Math.ceil(data.total / LIMIT)}</span>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
            <button className="btn" disabled={page * LIMIT >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
          </div>
        )}
      </div>
      {open && <StudentDialog mssv={open} isAdmin={user?.role === 'SCHOOL_ADMIN'} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

function StudentDialog({ mssv, isAdmin, onClose, onChanged }: { mssv: string; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [info, setInfo] = useState<{ student: StudentItem; history: StudentHistoryItem[] } | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'merge'>('view');
  const [error, setError] = useState('');
  const load = useCallback(() => api<{ student: StudentItem; history: StudentHistoryItem[] }>('GET', `/admin/students/${mssv}`).then(setInfo).catch((e) => setError(e.message)), [mssv]);
  useEffect(() => { load(); }, [load]);

  if (mode === 'merge' && info) {
    return <MergeDialog from={info.student} onClose={() => setMode('view')} onDone={() => { onChanged(); onClose(); }} />;
  }
  if (mode === 'edit' && info) {
    return <EditDialog student={info.student} onClose={() => setMode('view')} onDone={() => { onChanged(); load(); }} />;
  }
  return (
    <Dialog title={info ? `${info.student.fullName} · ${mssv}` : mssv} onClose={onClose}>
      {error && <div className="error">{error}</div>}
      {!info && !error && <p>Đang tải…</p>}
      {info && (
        <>
          <p className="sub">{info.student.faculty?.name} · Tổng <b>{info.student.totalDrl}</b> điểm rèn luyện · {info.student.attendanceCount} sự kiện</p>
          <div className="tablewrap" style={{ maxHeight: 280 }}>
            <table>
              <thead><tr><th>Sự kiện</th><th>Giờ vào</th><th>Duyệt</th><th>Điểm</th></tr></thead>
              <tbody>
                {info.history.map((h) => (
                  <tr key={h.attendanceId} style={h.voided ? { opacity: 0.5 } : undefined}>
                    <td>{h.eventTitle}</td><td>{fmt(h.checkinAt)}</td>
                    <td>{h.voided ? 'Đã hủy' : REVIEW_LABEL[h.reviewStatus][0]}</td><td>{h.drlAwarded ?? '—'}</td>
                  </tr>
                ))}
                {info.history.length === 0 && <tr><td colSpan={4}>Chưa có lượt điểm danh nào bạn được xem.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            {isAdmin && <button className="btn" onClick={() => setMode('merge')}>Gộp MSSV…</button>}
            <button className="btn" onClick={() => setMode('edit')}>Sửa thông tin</button>
            <button className="btn primary" onClick={onClose}>Đóng</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function EditDialog({ student, onClose, onDone }: { student: StudentItem; onClose: () => void; onDone: () => void }) {
  const [faculties, setFaculties] = useState<Unit[]>([]);
  const [fullName, setFullName] = useState(student.fullName);
  const [facultyUnitId, setFacultyUnitId] = useState(student.faculty?.id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setFaculties(p.items.filter((u) => u.type === 'FACULTY'))).catch(() => {}); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { reason: reason.trim() };
    if (fullName !== student.fullName) body.fullName = fullName;
    if (facultyUnitId !== student.faculty?.id) body.facultyUnitId = facultyUnitId;
    try {
      await api('PATCH', `/admin/students/${student.mssv}`, body);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được.');
    }
  }
  return (
    <Dialog title={`Sửa ${student.mssv}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}
        <label className="field"><span>Họ tên</span><input required minLength={2} maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
        <label className="field"><span>Khoa</span>
          <select value={facultyUnitId} onChange={(e) => setFacultyUnitId(e.target.value)}>{faculties.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="field"><span>Lý do *</span><input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Hủy</button><button className="btn primary">Lưu</button></div>
      </form>
    </Dialog>
  );
}

function MergeDialog({ from, onClose, onDone }: { from: StudentItem; onClose: () => void; onDone: () => void }) {
  const [into, setInto] = useState('');
  return (
    <ReasonDialog
      title={`Gộp ${from.mssv} vào MSSV khác`} label="Lý do gộp" confirmText="Gộp" danger onClose={onClose}
      onSubmit={async (reason) => {
        await api('POST', `/admin/students/${from.mssv}/merge`, { intoMssv: into.trim().toUpperCase(), reason });
        onDone();
      }}
      extra={
        <label className="field"><span>MSSV giữ lại (đúng) *</span>
          <input className="mono" required maxLength={20} value={into} onChange={(e) => setInto(e.target.value)} /></label>
      }
      disabled={into.trim().length < 5}
    />
  );
}
