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
  // thao tac anh huong nhieu du lieu: phai go lai dung ten doi tuong moi bam duoc nut (dac ta 3.7)
  confirmText2?: string;
}

export function ReasonDialog({ title, label = 'Lý do', confirmText, danger, onClose, onSubmit, extra, disabled, confirmText2 }: Props) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
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
        {confirmText2 && (
          <label className="field">
            <span>Gõ lại chính xác “{confirmText2}” để xác nhận</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
        )}
        <label className="field">
          <span>{label}</span>
          <textarea rows={3} required minLength={3} maxLength={500} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || disabled || reason.trim().length < 3 || (confirmText2 !== undefined && typed.trim() !== confirmText2.trim())}>{busy ? 'Đang xử lý…' : confirmText}</button>
        </div>
      </form>
    </Dialog>
  );
}
