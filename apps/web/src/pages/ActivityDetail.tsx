// Chi tiet ho so hoat dong (dac ta quan-ly-hoat-dong 3, 4, A12): tien trinh, thao tac theo trang thai + quyen,
// checklist danh gia (chi goi y), gan buoi diem danh, lich su thay doi, binh luan.
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, ActivityComment, api, ApiError, ChecklistCriterion, EventItem, Page, TimelineItem,
} from '../api';
import { useAuth } from '../auth';
import { Dialog } from '../components/Dialog';
import { ReasonDialog } from '../components/ReasonDialog';
import {
  ACTIVITY_STEPS, ActivityBadge, ACTIVITY_STATUS, EVALUATION_LABEL, FIELD_LABEL, fmt, LEVEL_LABEL, LINK_GROUP_LABEL, LINK_TYPE_LABEL,
  MODE_LABEL, REWARD_LABEL, vnd, WORKFLOW_LABEL,
} from '../format';

type Dlg = null | 'return' | 'reject' | 'evaluate' | 'reward' | 'reopen' | 'delete' | 'link';

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return `${v.length} mục`;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmt(v);
  return String(v);
};

export function ActivityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [a, setA] = useState<Activity | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [checklist, setChecklist] = useState<{ criteria: ChecklistCriterion[]; suggestion: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api<Activity>('GET', `/admin/activities/${id}`);
      setA(d);
      const [t, c] = await Promise.all([
        api<{ items: TimelineItem[] }>('GET', `/admin/activities/${id}/timeline`),
        api<{ items: ActivityComment[] }>('GET', `/admin/activities/${id}/comments`),
      ]);
      setTimeline(t.items);
      setComments(c.items);
      if (d.canReview && ['PENDING_EVAL', 'EVALUATED'].includes(d.status)) setChecklist(await api('GET', `/admin/activities/${id}/checklist`));
      else setChecklist(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được hồ sơ.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // thao tac don gian khong can hop thoai
  async function run(action: string, body: object = {}) {
    setBusy(true);
    setError('');
    try {
      await api('POST', `/admin/activities/${id}/${action}`, body);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Thao tác không thành công.');
    } finally {
      setBusy(false);
    }
  }

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length === 0) return;
    setBusy(true);
    try {
      await api('POST', `/admin/activities/${id}/comments`, { content: text.trim() });
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không gửi được bình luận.');
    } finally {
      setBusy(false);
    }
  }

  if (!a) return <>{error ? <div className="error" role="alert">{error}</div> : <p>Đang tải…</p>}<Link to="/hoat-dong">← Danh sách hoạt động</Link></>;

  const isAdmin = user?.role === 'SCHOOL_ADMIN';
  const step = ACTIVITY_STEPS.indexOf(a.status);
  const byGroup = (g: string) => (a.links ?? []).filter((l) => l.group === g);
  const canManage = a.canEdit || a.canSubmit || a.canReview;

  return (
    <>
      <p><Link to="/hoat-dong">← Danh sách hoạt động</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}><span className="mono">{a.code}</span> · {a.name}</h1>
          <p className="sub">
            {a.unit?.name} · {a.academicYear?.name} · {a.category?.name ?? 'Chưa phân loại'} · {LEVEL_LABEL[a.level]}{' '}
            <ActivityBadge status={a.status} />{' '}
            {a.evaluation && <span className={`badge ${EVALUATION_LABEL[a.evaluation][1]}`}>{EVALUATION_LABEL[a.evaluation][0]}</span>}{' '}
            {a.reward && <span className={`badge ${REWARD_LABEL[a.reward][1]}`}>{REWARD_LABEL[a.reward][0]}</span>}
          </p>
        </div>
        <div className="row">
          {a.canEdit && <Link className="btn" to={`/hoat-dong/${a.id}/sua`}>Sửa</Link>}
          {a.canSubmit && a.status === 'DRAFT' && <button className="btn primary" disabled={busy} onClick={() => run('submit')}>Nộp duyệt kế hoạch</button>}
          {a.canSubmit && a.status === 'IN_PROGRESS' && <button className="btn primary" disabled={busy} onClick={() => run('submit-result')}>Nộp báo cáo kết quả</button>}
          {a.canReview && a.status === 'PENDING_PLAN' && <button className="btn primary" disabled={busy} onClick={() => run('approve')}>Duyệt kế hoạch</button>}
          {a.canReview && ['PENDING_PLAN', 'PENDING_EVAL'].includes(a.status) && <button className="btn" onClick={() => setDlg('return')}>Trả lại bổ sung</button>}
          {a.canReview && a.status === 'PENDING_EVAL' && <button className="btn primary" onClick={() => setDlg('evaluate')}>Đánh giá</button>}
          {a.canReview && a.status === 'EVALUATED' && <button className="btn primary" onClick={() => setDlg('reward')}>Xét khen thưởng</button>}
          {a.canReview && a.status === 'LOCKED' && <button className="btn" onClick={() => setDlg('reopen')}>Mở lại hồ sơ</button>}
          {a.canEdit && a.status === 'DRAFT' && <button className="btn danger" onClick={() => setDlg('delete')}>Xóa</button>}
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {a.returnNote && (
        <div className="error" role="status">
          <b>Đoàn trường yêu cầu bổ sung:</b> {a.returnNote}
        </div>
      )}
      {!canManage && <div className="notice">Bạn chỉ xem được hồ sơ này (đơn vị phối hợp hoặc năm học đã khóa).</div>}

      <ol className="stepper" aria-label="Tiến trình hồ sơ">
        {ACTIVITY_STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>{ACTIVITY_STATUS[s][0]}</li>
        ))}
      </ol>

      <div className="cols2">
        <div>
          <div className="card">
            <h2>Thông tin</h2>
            <dl className="kv">
              <dt>Thời gian</dt><dd>{fmt(a.startAt)} – {fmt(a.endAt)}</dd>
              <dt>Địa điểm</dt><dd>{a.location ?? '—'} ({MODE_LABEL[a.mode]})</dd>
              <dt>Đối tượng</dt><dd>{a.targetAudience ?? '—'}</dd>
              <dt>Phụ trách</dt><dd>{a.ownerName ?? '—'}{a.ownerPhone ? ` · ${a.ownerPhone}` : ''}</dd>
              <dt>Dự kiến / thực tế</dt>
              <dd>
                {a.expectedCount ?? '—'} / {a.actualCount ?? '—'}
                {a.actualSource === 'ATTENDANCE' && <small className="hint">Lấy tự động từ điểm danh.</small>}
                {a.actualSource === 'MANUAL' && <small className="hint">Nhập tay.</small>}
              </dd>
              <dt>Kinh phí</dt><dd>Dự kiến {vnd(a.budgetPlanned)} · Thực tế {vnd(a.budgetActual)}</dd>
              <dt>Đơn vị phối hợp</dt><dd>{a.coUnits.length ? a.coUnits.map((u) => u.name).join(', ') : '—'}</dd>
              <dt>Kế hoạch</dt>
              <dd>{a.planUrl ? <a href={a.planUrl} target="_blank" rel="noopener noreferrer nofollow">{a.planUrl}</a> : <span className="sub">Chưa có (bắt buộc khi nộp duyệt)</span>}</dd>
              {a.note && <><dt>Ghi chú</dt><dd>{a.note}</dd></>}
              {a.evaluationNote && <><dt>Nhận xét</dt><dd>{a.evaluationNote}</dd></>}
              {a.rewardNote && <><dt>Ghi chú khen thưởng</dt><dd>{a.rewardNote}</dd></>}
            </dl>
          </div>

          <div className="card">
            <h2>Sản phẩm và báo cáo</h2>
            {(['MEDIA', 'PUBLICATION', 'RESULT'] as const).map((g) => (
              <div key={g} style={{ marginBottom: 12 }}>
                <b>{LINK_GROUP_LABEL[g]}</b> <span className="sub">({byGroup(g).length}/5)</span>
                {byGroup(g).length === 0 && <p className="sub" style={{ margin: '4px 0 0' }}>Chưa có.</p>}
                <ul className="plain">
                  {byGroup(g).map((l) => (
                    <li key={l.id}>
                      <span className="badge info">{LINK_TYPE_LABEL[l.type]}</span>{' '}
                      <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.url}</a>
                      {l.publishedOn && <span className="sub"> · {l.publishedOn.split('-').reverse().join('/')}</span>}
                      {l.needsReview && <span className="badge wait" title="Tên miền chưa nằm trong danh sách tin cậy; Đoàn trường sẽ xem lại.">Cần kiểm tra</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Buổi điểm danh liên kết</h2>
              {a.canEdit && <button className="btn" onClick={() => setDlg('link')}>+ Gắn buổi điểm danh</button>}
            </div>
            {(a.events ?? []).length === 0 && <p className="sub">Chưa gắn buổi nào. Gắn buổi điểm danh để số người tham gia tự lấy từ điểm danh.</p>}
            <ul className="plain">
              {(a.events ?? []).map((ev) => (
                <li key={ev.id}>
                  <Link to={`/su-kien/${ev.id}`}>{ev.title}</Link> <span className="sub">· {fmt(ev.startAt)} · {ev.attendanceCount} lượt</span>
                  {a.canEdit && <UnlinkButton activityId={a.id} eventId={ev.id} onDone={load} onError={setError} />}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          {checklist && (
            <div className="card">
              <h2>Đối chiếu tiêu chí</h2>
              <ul className="plain">
                {checklist.criteria.map((c) => (
                  <li key={c.key}>
                    {c.passed === true ? '✅' : c.passed === false ? '❌' : '⬜'} {c.label}
                    {!c.auto && <span className="sub"> · người đánh giá tự xác nhận</span>}
                    {c.auto && c.passed === null && <span className="sub"> · chưa đủ dữ liệu</span>}
                  </li>
                ))}
              </ul>
              <p className="notice" style={{ margin: 0 }}>
                Gợi ý: <b>{checklist.suggestion === 'COMPLETED' ? 'Hoàn thành' : 'Chưa hoàn thành'}</b>. Đây chỉ là gợi ý, quyết định thuộc về người đánh giá.
              </p>
            </div>
          )}

          <div className="card">
            <h2>Lịch sử</h2>
            {timeline.length === 0 && <p className="sub">Chưa có thay đổi.</p>}
            <ul className="history">
              {[...timeline].reverse().map((t, i) => (
                <li key={i}>
                  <b>{t.kind === 'WORKFLOW' ? WORKFLOW_LABEL[t.action] ?? t.action : `Sửa hồ sơ (phiên bản ${t.version})`}</b>
                  <span className="sub"> · {t.actor ?? 'Hệ thống'} · {fmt(t.at)}</span>
                  {t.note && <div>{t.note}</div>}
                  {t.diff && (
                    <ul className="plain">
                      {Object.entries(t.diff).map(([k, d]) => (
                        <li key={k} className="sub">{FIELD_LABEL[k] ?? k}: {show(d.from)} → {show(d.to)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>Trao đổi</h2>
            {comments.length === 0 && <p className="sub">Chưa có bình luận.</p>}
            <ul className="plain">
              {comments.map((c) => (
                <li key={c.id}><b>{c.author ?? 'Ẩn danh'}</b> <span className="sub">· {fmt(c.createdAt)}</span><div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div></li>
              ))}
            </ul>
            {(canManage || isAdmin) && (
              <form onSubmit={sendComment}>
                <label className="field">
                  <span>Bình luận</span>
                  <textarea rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
                </label>
                <button className="btn primary" disabled={busy || text.trim().length === 0}>Gửi</button>
              </form>
            )}
          </div>
        </div>
      </div>

      {dlg === 'return' && (
        <ReasonDialog title="Trả lại bổ sung" label="Nội dung cần bổ sung" confirmText="Trả lại" onClose={() => setDlg(null)}
          onSubmit={async (note) => { await api('POST', `/admin/activities/${a.id}/return`, { note }); await load(); }} />
      )}
      {dlg === 'reopen' && (
        <ReasonDialog title="Mở lại hồ sơ đã chốt" confirmText="Mở lại" danger onClose={() => setDlg(null)}
          onSubmit={async (reason) => { await api('POST', `/admin/activities/${a.id}/reopen`, { reason }); await load(); }} />
      )}
      {dlg === 'delete' && (
        <ReasonDialog title="Xóa hồ sơ nháp" confirmText="Xóa hồ sơ" danger onClose={() => setDlg(null)}
          onSubmit={async (reason) => { await api('DELETE', `/admin/activities/${a.id}`, { reason }); nav('/hoat-dong'); }} />
      )}
      {dlg === 'evaluate' && (
        <ChoiceDialog title="Đánh giá hoạt động" suggestion={checklist?.suggestion}
          options={[['COMPLETED', 'Hoàn thành'], ['NOT_COMPLETED', 'Chưa hoàn thành']]} noteRequiredFor="NOT_COMPLETED"
          onClose={() => setDlg(null)} onSubmit={async (result, note) => { await api('POST', `/admin/activities/${a.id}/evaluate`, { result, note: note || undefined }); await load(); }} />
      )}
      {dlg === 'reward' && (
        <ChoiceDialog title="Xét khen thưởng (sẽ chốt hồ sơ)" options={[['APPROVED', 'Đề xuất khen thưởng'], ['REJECTED', 'Không khen thưởng']]} noteRequiredFor="REJECTED"
          disabledOptions={a.evaluation === 'COMPLETED' ? [] : ['APPROVED']}
          onClose={() => setDlg(null)} onSubmit={async (result, note) => { await api('POST', `/admin/activities/${a.id}/reward`, { result, note: note || undefined }); await load(); }} />
      )}
      {dlg === 'link' && <LinkEventDialog activity={a} onClose={() => setDlg(null)} onDone={load} />}
    </>
  );
}

function UnlinkButton({ activityId, eventId, onDone, onError }: { activityId: string; eventId: string; onDone: () => void; onError: (m: string) => void }) {
  return (
    <button
      className="btn"
      style={{ marginLeft: 8 }}
      onClick={() => api('DELETE', `/admin/activities/${activityId}/events/${eventId}`).then(onDone).catch((e) => onError(e instanceof ApiError ? e.message : 'Không gỡ được.'))}
    >
      Gỡ
    </button>
  );
}

// chon mot ket qua + nhan xet (bat buoc voi ket qua tieu cuc)
function ChoiceDialog({ title, options, noteRequiredFor, disabledOptions = [], suggestion, onClose, onSubmit }: {
  title: string;
  options: Array<[string, string]>;
  noteRequiredFor: string;
  disabledOptions?: string[];
  suggestion?: string;
  onClose: () => void;
  onSubmit: (result: string, note: string) => Promise<void>;
}) {
  const first = options.find(([v]) => !disabledOptions.includes(v))?.[0] ?? options[0][0];
  const [result, setResult] = useState(suggestion && options.some(([v]) => v === suggestion) ? suggestion : first);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const needNote = result === noteRequiredFor;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(result, note.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác không thành công.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        {options.map(([v, l]) => (
          <label key={v} className="check">
            <input type="radio" name="result" value={v} disabled={disabledOptions.includes(v)} checked={result === v} onChange={() => setResult(v)} />
            <span>{l}{suggestion === v && <span className="sub"> (gợi ý)</span>}</span>
          </label>
        ))}
        {disabledOptions.length > 0 && <small className="hint">Chỉ đề xuất khen thưởng khi hoạt động đã được đánh giá “Hoàn thành”.</small>}
        <label className="field">
          <span>Nhận xét{needNote ? ' *' : ' (không bắt buộc)'}</span>
          <textarea rows={3} maxLength={1000} required={needNote} minLength={needNote ? 3 : undefined} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy || (needNote && note.trim().length < 3)}>{busy ? 'Đang lưu…' : 'Xác nhận'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function LinkEventDialog({ activity, onClose, onDone }: { activity: Activity; onClose: () => void; onDone: () => void }) {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');
  const linked = new Set((activity.events ?? []).map((e) => e.id));

  useEffect(() => {
    api<Page<EventItem>>('GET', '/admin/events?limit=100').then((p) => setEvents(p.items.filter((e) => !linked.has(e.id) && e.canManage))).catch(() => setEvents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('POST', `/admin/activities/${activity.id}/events`, { eventId });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không gắn được buổi điểm danh.');
    }
  }

  return (
    <Dialog title="Gắn buổi điểm danh" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error" role="alert">{error}</div>}
        {!events && <p>Đang tải…</p>}
        {events && events.length === 0 && <p className="sub">Không còn sự kiện nào để gắn.</p>}
        {events && events.length > 0 && (
          <label className="field">
            <span>Sự kiện</span>
            <select required value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">— Chọn sự kiện —</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {fmt(e.startAt)}</option>)}
            </select>
          </label>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={!eventId}>Gắn</button>
        </div>
      </form>
    </Dialog>
  );
}
