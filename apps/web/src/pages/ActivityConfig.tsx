// Cau hinh nam hoc va linh vuc hoat dong - chi Doan truong (dac ta quan-ly-hoat-dong 2, 3.1, A18).
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AcademicYear, ActivityCategory, api, ApiError } from '../api';
import { Dialog } from '../components/Dialog';
import { ReasonDialog } from '../components/ReasonDialog';
import { dmy } from '../format';

export function ActivityConfig() {
  const [tab, setTab] = useState<'years' | 'categories'>('years');
  return (
    <>
      <h1>Năm học và lĩnh vực</h1>
      <p className="sub">Khóa sổ năm học để chặn sửa hồ sơ; quản lý danh mục lĩnh vực hoạt động.</p>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'years'} className={tab === 'years' ? 'on' : ''} onClick={() => setTab('years')}>Năm học</button>
        <button role="tab" aria-selected={tab === 'categories'} className={tab === 'categories' ? 'on' : ''} onClick={() => setTab('categories')}>Lĩnh vực</button>
      </div>
      {tab === 'years' ? <Years /> : <Categories />}
    </>
  );
}

function Years() {
  const [items, setItems] = useState<AcademicYear[] | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<AcademicYear | 'new' | null>(null);
  const [lock, setLock] = useState<AcademicYear | null>(null);

  const load = useCallback(() => {
    api<AcademicYear[]>('GET', '/admin/academic-years').then(setItems).catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được.'));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" onClick={() => setEdit('new')}>+ Thêm năm học</button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="card">
        {!items && !error && <p>Đang tải…</p>}
        {items && (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Năm học</th><th>Thời gian</th><th>Hạn nộp kế hoạch</th><th>Hạn nộp báo cáo</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {items.map((y) => (
                  <tr key={y.id}>
                    <td><b>{y.name}</b></td>
                    <td>{dmy(y.startDate)} – {dmy(y.endDate)}</td>
                    <td>{y.planDeadline ? dmy(y.planDeadline) : '—'}</td>
                    <td>{y.reportDeadline ? dmy(y.reportDeadline) : '—'}</td>
                    <td>{y.locked ? <span className="badge err">Đã khóa</span> : <span className="badge ok">Đang mở</span>}</td>
                    <td className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn" onClick={() => setEdit(y)}>Sửa</button>
                      <button className="btn" onClick={() => setLock(y)}>{y.locked ? 'Mở khóa' : 'Khóa sổ'}</button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="sub">Chưa có năm học nào. Thêm năm học trước khi tạo hoạt động.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <YearDialog year={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={load} />}
      {lock && (
        <ReasonDialog
          title={lock.locked ? `Mở khóa năm học ${lock.name}` : `Khóa sổ năm học ${lock.name}`}
          confirmText={lock.locked ? 'Mở khóa' : 'Khóa sổ'} danger={!lock.locked}
          extra={!lock.locked ? <div className="notice">Sau khi khóa, mọi hồ sơ của năm học này không còn thêm, sửa hay nộp được.</div> : undefined}
          onClose={() => setLock(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/academic-years/${lock.id}/${lock.locked ? 'unlock' : 'lock'}`, { reason }); load(); }}
        />
      )}
    </>
  );
}

function YearDialog({ year, onClose, onDone }: { year: AcademicYear | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    name: year?.name ?? '', startDate: year?.startDate ?? '', endDate: year?.endDate ?? '',
    planDeadline: year?.planDeadline ?? '', reportDeadline: year?.reportDeadline ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (year) await api('PATCH', `/admin/academic-years/${year.id}`, { ...f, planDeadline: f.planDeadline || null, reportDeadline: f.reportDeadline || null });
      else await api('POST', '/admin/academic-years', { ...f, planDeadline: f.planDeadline || undefined, reportDeadline: f.reportDeadline || undefined });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={year ? 'Sửa năm học' : 'Thêm năm học'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        <label className="field"><span>Tên năm học *</span><input required minLength={4} maxLength={20} placeholder="2026–2027" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        <div className="grid2">
          <label className="field"><span>Ngày bắt đầu *</span><input type="date" required value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
          <label className="field"><span>Ngày kết thúc *</span><input type="date" required min={f.startDate || undefined} value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></label>
          <label className="field"><span>Hạn nộp kế hoạch</span><input type="date" value={f.planDeadline} onChange={(e) => set('planDeadline', e.target.value)} /></label>
          <label className="field"><span>Hạn nộp báo cáo</span><input type="date" value={f.reportDeadline} onChange={(e) => set('reportDeadline', e.target.value)} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function Categories() {
  const [items, setItems] = useState<ActivityCategory[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    api<ActivityCategory[]>('GET', '/admin/activity-categories').then(setItems).catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được.'));
  }, []);
  useEffect(load, [load]);

  const attempt = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Không thực hiện được.'); }
  };

  return (
    <>
      {error && <div className="error" role="alert">{error}</div>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); attempt(async () => { await api('POST', '/admin/activity-categories', { name: name.trim() }); setName(''); }); }}>
        <label className="field" style={{ flex: 1, margin: 0 }}>
          <span>Thêm lĩnh vực</span>
          <input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn primary" style={{ alignSelf: 'end' }} disabled={name.trim().length < 2}>Thêm</button>
      </form>
      <div className="card" style={{ marginTop: 16 }}>
        {!items && !error && <p>Đang tải…</p>}
        {items && (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Lĩnh vực</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {editing?.id === c.id ? (
                        <form className="row" onSubmit={(e) => { e.preventDefault(); attempt(async () => { await api('PATCH', `/admin/activity-categories/${c.id}`, { name: editing.name.trim() }); setEditing(null); }); }}>
                          <input aria-label="Tên lĩnh vực" required minLength={2} maxLength={100} value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} />
                          <button className="btn primary">Lưu</button>
                          <button type="button" className="btn" onClick={() => setEditing(null)}>Hủy</button>
                        </form>
                      ) : c.name}
                    </td>
                    <td>{c.isActive ? <span className="badge ok">Đang dùng</span> : <span className="badge draft">Đã tắt</span>}</td>
                    <td className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn" onClick={() => setEditing({ id: c.id, name: c.name })}>Đổi tên</button>
                      <button className="btn" onClick={() => attempt(() => api('PATCH', `/admin/activity-categories/${c.id}`, { isActive: !c.isActive }))}>{c.isActive ? 'Tắt' : 'Bật'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <small className="hint">Lĩnh vực đã tắt không chọn được cho hoạt động mới; hoạt động cũ vẫn giữ nguyên.</small>
      </div>
    </>
  );
}
