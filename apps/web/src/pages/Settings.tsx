// Cau hinh he thong (chi Doan truong) - dac ta 3.8, 6 (system_settings). Chi gui cac khoa da doi.
import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface Field { key: string; label: string; hint: string; kind: 'number' | 'text'; min?: number; max?: number }

const FIELDS: Field[] = [
  { key: 'mssv_regex', label: 'Mẫu MSSV', hint: 'Biểu thức chính quy; phải khớp mã mẫu 24211TM1152. Đổi sai sẽ chặn sinh viên điểm danh.', kind: 'text' },
  { key: 'appeal_days', label: 'Số ngày khiếu nại', hint: 'Tính từ lúc sự kiện kết thúc (1–60).', kind: 'number', min: 1, max: 60 },
  { key: 'default_open_before_min', label: 'Mở điểm danh trước giờ bắt đầu (phút)', hint: 'Giá trị gợi ý khi tạo sự kiện (0–240).', kind: 'number', min: 0, max: 240 },
  { key: 'default_grace_min', label: 'Số phút ân hạn', hint: 'Đến trễ trong ngần này phút vẫn tính đúng giờ (0–120).', kind: 'number', min: 0, max: 120 },
  { key: 'data_retention_months', label: 'Lưu dữ liệu vị trí (tháng)', hint: 'Thời hạn đề xuất 6 tháng. Hiện mới lưu cấu hình, chưa có tác vụ tự ẩn danh (1–60).', kind: 'number', min: 1, max: 60 },
  { key: 'device_mssv_window_days', label: 'Xét thiết bị dùng cho nhiều MSSV trong (ngày)', hint: 'Cửa sổ thời gian của cờ "Thiết bị dùng cho nhiều MSSV" (1–730).', kind: 'number', min: 1, max: 730 },
];

export function Settings() {
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const adopt = (s: Record<string, unknown>) => {
    setSaved(s);
    setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(s[f.key] ?? '')])));
  };
  useEffect(() => {
    api<Record<string, unknown>>('GET', '/admin/settings').then(adopt).catch((e) => setError(e instanceof ApiError ? e.message : 'Không tải được cấu hình.'));
  }, []);

  const changed = FIELDS.filter((f) => saved && draft[f.key] !== String(saved[f.key] ?? ''));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setOk(false);
    try {
      const patch = Object.fromEntries(changed.map((f) => [f.key, f.kind === 'number' ? Number(draft[f.key]) : draft[f.key]]));
      adopt(await api<Record<string, unknown>>('PATCH', '/admin/settings', patch));
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được cấu hình.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Cấu hình hệ thống</h1>
      <p className="sub">Mọi thay đổi được ghi vào nhật ký (giá trị trước và sau).</p>
      {!saved && !error && <p>Đang tải…</p>}
      {saved && (
        <form className="card" onSubmit={submit} style={{ maxWidth: 640 }}>
          {error && <div className="error" role="alert">{error}</div>}
          {ok && <div className="notice" role="status">Đã lưu cấu hình.</div>}
          {FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <input type={f.kind} required min={f.min} max={f.max} step={f.kind === 'number' ? 1 : undefined} maxLength={f.kind === 'text' ? 200 : undefined}
                className={f.kind === 'text' ? 'mono' : undefined} value={draft[f.key] ?? ''} onChange={(e) => { setDraft({ ...draft, [f.key]: e.target.value }); setOk(false); }} />
              <span style={{ fontSize: 13, color: 'var(--faint)', marginTop: 4 }}>{f.hint}</span>
            </label>
          ))}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" disabled={changed.length === 0} onClick={() => adopt(saved)}>Hoàn tác</button>
            <button className="btn primary" disabled={busy || changed.length === 0}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
          </div>
        </form>
      )}
    </>
  );
}
