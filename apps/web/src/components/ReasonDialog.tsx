// Hop thoai nhap ly do (>= 3 ky tu) cho thao tac nhay cam - dac ta 3.7
import { FormEvent, ReactNode, useState } from 'react';
import { ApiError } from '../api';
import { Dialog } from './Dialog';

interface Props {
  title: string;
  label?: string;
  confirmText: string;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  // o nhap them phia tren o ly do, va dieu kien khoa nut gui
  extra?: ReactNode;
  disabled?: boolean;
}

export function ReasonDialog({ title, label = 'Lý do', confirmText, danger, onClose, onSubmit, extra, disabled }: Props) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(reason.trim());
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
        {extra}
        <label className="field">
          <span>{label}</span>
          <textarea rows={3} required minLength={3} maxLength={500} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || disabled || reason.trim().length < 3}>{busy ? 'Đang xử lý…' : confirmText}</button>
        </div>
      </form>
    </Dialog>
  );
}
