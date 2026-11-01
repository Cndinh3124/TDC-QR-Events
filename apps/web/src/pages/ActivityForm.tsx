// Tao / sua ho so hoat dong (dac ta quan-ly-hoat-dong 3, A11). Nam hoc va don vi chi chon luc tao.
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AcademicYear, Activity, ActivityCategory, ActivityLink, api, ApiError, LinkGroup, LinkType, Page, Unit } from '../api';
import { useAuth } from '../auth';
import { LEVEL_LABEL, LINK_GROUP_LABEL, LINK_TYPE_LABEL, MODE_LABEL, toIso, toLocalInput } from '../format';

interface LinkRow { group: LinkGroup; type: LinkType; url: string; publishedOn: string }
const MAX_PER_GROUP = 5;

const empty = {
  academicYearId: '', unitId: '', categoryId: '', level: '', name: '', startAt: '', endAt: '', location: '', mode: 'ONSITE',
  targetAudience: '', expectedCount: '', manualCount: '', budgetPlanned: '', budgetActual: '', ownerName: '', ownerPhone: '', planUrl: '', note: '',
};

// o so de trong -> null (khi sua, de xoa gia tri) hoac bo qua (khi tao)
const intOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

export function ActivityForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { user } = useAuth();
  const isSchool = user?.role === 'SCHOOL_ADMIN';
  const nav = useNavigate();

  const [f, setF] = useState(empty);
  const [coUnitIds, setCoUnitIds] = useState<string[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api<AcademicYear[]>('GET', '/admin/academic-years').then((ys) => {
      setYears(ys);
      const today = new Date().toISOString().slice(0, 10);
      const open = ys.filter((y) => !y.locked);
      const cur = open.find((y) => y.startDate <= today && today <= y.endDate) ?? open[0];
      if (!editing && cur) setF((p) => (p.academicYearId ? p : { ...p, academicYearId: cur.id }));
    }).catch(() => {});
    api<ActivityCategory[]>('GET', '/admin/activity-categories').then(setCategories).catch(() => {});
    api<Page<Unit>>('GET', '/admin/units?limit=100').then((p) => setUnits(p.items.filter((u) => u.isActive !== false))).catch(() => {});
  }, [editing]);

  useEffect(() => {
    if (!id) return;
    api<Activity>('GET', `/admin/activities/${id}`)
      .then((a) => {
        if (!a.canEdit) { setError('Hồ sơ này hiện không sửa được (đang chờ duyệt, đã chốt hoặc thuộc năm học đã khóa).'); return; }
        setF({
          academicYearId: a.academicYear?.id ?? '', unitId: a.unit?.id ?? '', categoryId: a.category?.id ?? '', level: a.level, name: a.name,
          startAt: toLocalInput(a.startAt), endAt: toLocalInput(a.endAt), location: a.location ?? '', mode: a.mode,
          targetAudience: a.targetAudience ?? '', expectedCount: a.expectedCount?.toString() ?? '', manualCount: a.manualCount?.toString() ?? '',
          budgetPlanned: a.budgetPlanned?.toString() ?? '', budgetActual: a.budgetActual?.toString() ?? '', ownerName: a.ownerName ?? '',
          ownerPhone: a.ownerPhone ?? '', planUrl: a.planUrl ?? '', note: a.note ?? '',
        });
        setCoUnitIds(a.coUnits.map((u) => u.id));
        setLinks((a.links ?? []).map((l: ActivityLink) => ({ group: l.group, type: l.type, url: l.url, publishedOn: l.publishedOn ?? '' })));
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được hồ sơ.'));
  }, [id]);

  const countIn = (g: LinkGroup) => links.filter((l) => l.group === g).length;
  const addLink = (group: LinkGroup) => setLinks((p) => [...p, { group, type: group === 'MEDIA' ? 'FACEBOOK' : 'OTHER', url: '', publishedOn: '' }]);
  const patchLink = (i: number, c: Partial<LinkRow>) => setLinks((p) => p.map((l, j) => (j === i ? { ...l, ...c } : l)));
  const toggleCo = (uid: string) => setCoUnitIds((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const linkBody = links.filter((l) => l.url.trim()).map((l) => ({
      group: l.group, type: l.type, url: l.url.trim(), ...(l.publishedOn ? { publishedOn: l.publishedOn } : {}),
    }));
    try {
      if (editing) {
        // khi sua, o de trong nghia la xoa gia tri (null)
        const body = {
          categoryId: f.categoryId || null, level: f.level || undefined, name: f.name, startAt: toIso(f.startAt), endAt: toIso(f.endAt),
          location: f.location, mode: f.mode, targetAudience: f.targetAudience, expectedCount: intOrNull(f.expectedCount),
          manualCount: intOrNull(f.manualCount), budgetPlanned: intOrNull(f.budgetPlanned), budgetActual: intOrNull(f.budgetActual),
          ownerName: f.ownerName, ownerPhone: f.ownerPhone, planUrl: f.planUrl, note: f.note, coUnitIds, links: linkBody,
        };
        await api('PATCH', `/admin/activities/${id}`, body);
        nav(`/hoat-dong/${id}`);
      } else {
        const opt = (v: string) => (v.trim() ? v.trim() : undefined);
        const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
        const created = await api<Activity>('POST', '/admin/activities', {
          academicYearId: f.academicYearId, unitId: isSchool ? opt(f.unitId) : undefined, categoryId: opt(f.categoryId), level: opt(f.level),
          name: f.name, startAt: toIso(f.startAt), endAt: toIso(f.endAt), location: opt(f.location), mode: f.mode,
          targetAudience: opt(f.targetAudience), expectedCount: num(f.expectedCount), manualCount: num(f.manualCount),
          budgetPlanned: num(f.budgetPlanned), budgetActual: num(f.budgetActual), ownerName: opt(f.ownerName), ownerPhone: opt(f.ownerPhone),
          planUrl: opt(f.planUrl), note: opt(f.note), coUnitIds, links: linkBody,
        });
        nav(`/hoat-dong/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được, vui lòng thử lại.');
      setBusy(false);
    }
  }

  const coChoices = units.filter((u) => u.id !== (f.unitId || user?.unitId));
  const openYears = years.filter((y) => !y.locked || y.id === f.academicYearId);

  if (!loaded) return <>{error ? <div className="error" role="alert">{error}</div> : <p>Đang tải…</p>}<Link to={id ? `/hoat-dong/${id}` : '/hoat-dong'}>← Quay lại</Link></>;

  return (
    <form onSubmit={submit}>
      <h1>{editing ? 'Sửa hoạt động' : 'Thêm hoạt động'}</h1>
      <p className="sub">{editing ? 'Mỗi lần lưu sẽ ghi lại một phiên bản để xem lịch sử thay đổi.' : 'Mã hoạt động được cấp tự động khi lưu.'}</p>
      {error && <div className="error" role="alert">{error}</div>}

      <div className="card">
        <h2>Thông tin chung</h2>
        <div className="grid2">
          <label className="field">
            <span>Năm học *</span>
            <select required disabled={editing} value={f.academicYearId} onChange={(e) => set('academicYearId', e.target.value)}>
              <option value="">— Chọn năm học —</option>
              {openYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
            {years.length > 0 && openYears.length === 0 && <small className="hint">Tất cả năm học đều đã khóa. Liên hệ Đoàn trường để mở lại.</small>}
          </label>
          <label className="field">
            <span>Lĩnh vực</span>
            <select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Chưa phân loại —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Tên hoạt động *</span>
          <input required minLength={3} maxLength={255} value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <div className="grid2">
          {isSchool && !editing && (
            <label className="field">
              <span>Đơn vị tổ chức</span>
              <select value={f.unitId} onChange={(e) => set('unitId', e.target.value)}>
                <option value="">Đơn vị của tôi</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span>Cấp tổ chức</span>
            <select value={f.level} onChange={(e) => set('level', e.target.value)}>
              <option value="">Tự động theo đơn vị</option>
              {Object.entries(LEVEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Hình thức</span>
            <select value={f.mode} onChange={(e) => set('mode', e.target.value)}>
              {Object.entries(MODE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label className="field"><span>Bắt đầu *</span><input type="datetime-local" required value={f.startAt} onChange={(e) => set('startAt', e.target.value)} /></label>
          <label className="field"><span>Kết thúc *</span><input type="datetime-local" required min={f.startAt || undefined} value={f.endAt} onChange={(e) => set('endAt', e.target.value)} /></label>
        </div>
        <div className="grid2">
          <label className="field"><span>Địa điểm</span><input maxLength={255} value={f.location} onChange={(e) => set('location', e.target.value)} /></label>
          <label className="field"><span>Đối tượng tham gia</span><input maxLength={255} value={f.targetAudience} onChange={(e) => set('targetAudience', e.target.value)} /></label>
        </div>
        <div className="grid2">
          <label className="field"><span>Người phụ trách</span><input maxLength={120} value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></label>
          <label className="field"><span>Số điện thoại</span><input type="tel" maxLength={20} value={f.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} /></label>
        </div>
      </div>

      <div className="card">
        <h2>Quy mô và kinh phí</h2>
        <div className="grid2">
          <label className="field"><span>Số người dự kiến</span><input type="number" min={0} max={1000000} value={f.expectedCount} onChange={(e) => set('expectedCount', e.target.value)} /></label>
          <label className="field">
            <span>Số người tham gia (nhập tay)</span>
            <input type="number" min={0} max={1000000} value={f.manualCount} onChange={(e) => set('manualCount', e.target.value)} />
            <small className="hint">Khi gắn buổi điểm danh, số liệu thực tế tự lấy từ điểm danh.</small>
          </label>
          <label className="field"><span>Kinh phí dự kiến (đồng)</span><input type="number" min={0} value={f.budgetPlanned} onChange={(e) => set('budgetPlanned', e.target.value)} /></label>
          <label className="field"><span>Kinh phí thực tế (đồng)</span><input type="number" min={0} value={f.budgetActual} onChange={(e) => set('budgetActual', e.target.value)} /></label>
        </div>
      </div>

      <div className="card">
        <h2>Kế hoạch và sản phẩm</h2>
        <label className="field">
          <span>Link kế hoạch (bắt buộc khi nộp duyệt)</span>
          <input type="url" maxLength={2048} placeholder="https://docs.google.com/…" value={f.planUrl} onChange={(e) => set('planUrl', e.target.value)} />
          <small className="hint">Chỉ nhận đường dẫn https. Dán link Google Drive / Docs đã chia sẻ cho Đoàn trường.</small>
        </label>
        {(['MEDIA', 'PUBLICATION', 'RESULT'] as LinkGroup[]).map((g) => (
          <fieldset key={g} className="linkgroup">
            <legend>{LINK_GROUP_LABEL[g]} <span className="sub">({countIn(g)}/{MAX_PER_GROUP})</span></legend>
            {links.map((l, i) => l.group === g && (
              <div className="row linkrow" key={i}>
                <select aria-label="Loại link" value={l.type} onChange={(e) => patchLink(i, { type: e.target.value as LinkType })}>
                  {Object.entries(LINK_TYPE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <input aria-label="Đường dẫn" type="url" maxLength={2048} placeholder="https://…" value={l.url} onChange={(e) => patchLink(i, { url: e.target.value })} style={{ flex: 1, minWidth: 180 }} />
                <input aria-label="Ngày đăng" type="date" value={l.publishedOn} onChange={(e) => patchLink(i, { publishedOn: e.target.value })} />
                <button type="button" className="btn" aria-label="Xóa link" onClick={() => setLinks((p) => p.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" className="btn" disabled={countIn(g) >= MAX_PER_GROUP} onClick={() => addLink(g)}>+ Thêm link</button>
          </fieldset>
        ))}
        <label className="field">
          <span>Ghi chú</span>
          <textarea rows={3} maxLength={1000} value={f.note} onChange={(e) => set('note', e.target.value)} />
        </label>
      </div>

      <div className="card">
        <h2>Đơn vị phối hợp</h2>
        <p className="sub">Đơn vị phối hợp xem được hồ sơ này nhưng không sửa được.</p>
        <div className="faculty-list">
          {coChoices.map((u) => (
            <label key={u.id} className="check" style={{ marginBottom: 6 }}>
              <input type="checkbox" checked={coUnitIds.includes(u.id)} onChange={() => toggleCo(u.id)} />
              <span>{u.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Link className="btn" to={id ? `/hoat-dong/${id}` : '/hoat-dong'}>Hủy</Link>
        <button className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo hoạt động'}</button>
      </div>
    </form>
  );
}
