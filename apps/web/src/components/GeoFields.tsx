// Nhap toa do + ban kinh diem danh: nhap tay hoac lay vi tri hien tai cua may dang dung. Dac ta 3.1
import { useState } from 'react';

export interface Geo {
  latitude: string;
  longitude: string;
  radiusM: string;
}

export const emptyGeo: Geo = { latitude: '', longitude: '', radiusM: '' };

// '' ca ba = khong yeu cau GPS; co du ca ba = hop le; thieu mot trong ba = loi (backend cung kiem tra)
export function geoError(g: Geo): string {
  const filled = [g.latitude, g.longitude, g.radiusM].filter((v) => v.trim() !== '').length;
  return filled === 0 || filled === 3 ? '' : 'Cần nhập đủ vĩ độ, kinh độ và bán kính, hoặc để trống cả ba.';
}

export function GeoFields({ value, onChange }: { value: Geo; onChange: (g: Geo) => void }) {
  const [msg, setMsg] = useState('');
  const set = (k: keyof Geo, v: string) => onChange({ ...value, [k]: v });
  const hasPoint = value.latitude !== '' && value.longitude !== '';

  function useMyLocation() {
    if (!navigator.geolocation) return setMsg('Trình duyệt không hỗ trợ định vị.');
    setMsg('Đang lấy vị trí…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // API chi nhan toi da 6 chu so thap phan
        onChange({
          latitude: p.coords.latitude.toFixed(6),
          longitude: p.coords.longitude.toFixed(6),
          radiusM: value.radiusM || '100',
        });
        setMsg(`Đã lấy vị trí (sai số khoảng ${Math.round(p.coords.accuracy)} m).`);
      },
      () => setMsg('Không lấy được vị trí. Hãy cho phép trình duyệt truy cập vị trí hoặc nhập tay.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', margin: '0 0 14px' }}>
      <legend style={{ fontSize: 14, color: 'var(--muted)', padding: '0 6px' }}>Vị trí điểm danh (tùy chọn)</legend>
      <div className="grid2">
        <label className="field">
          <span>Vĩ độ</span>
          <input type="number" step="any" min={-90} max={90} placeholder="10.850000" value={value.latitude} onChange={(e) => set('latitude', e.target.value)} />
        </label>
        <label className="field">
          <span>Kinh độ</span>
          <input type="number" step="any" min={-180} max={180} placeholder="106.770000" value={value.longitude} onChange={(e) => set('longitude', e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Bán kính cho phép (mét, 10–5000)</span>
        <input type="number" min={10} max={5000} step={1} value={value.radiusM} onChange={(e) => set('radiusM', e.target.value)} />
      </label>
      <div className="row">
        <button type="button" className="btn" onClick={useMyLocation}>Lấy vị trí hiện tại của tôi</button>
        {hasPoint && (
          <a href={`https://www.openstreetmap.org/?mlat=${value.latitude}&mlon=${value.longitude}#map=18/${value.latitude}/${value.longitude}`} target="_blank" rel="noreferrer">
            Xem trên bản đồ
          </a>
        )}
        <button type="button" className="btn" onClick={() => onChange(emptyGeo)}>Xóa vị trí</button>
      </div>
      {msg && <p className="sub" style={{ margin: '10px 0 0' }}>{msg}</p>}
      <p className="sub" style={{ margin: '10px 0 0' }}>
        Sinh viên ngoài bán kính, hoặc không chia sẻ vị trí, vẫn điểm danh được nhưng bị gắn cờ cho người duyệt. Tọa độ không hiện ra trang công khai.
      </p>
    </fieldset>
  );
}

// chuoi form -> so (hoac null khi de trong) de gui API
export function geoPayload(g: Geo) {
  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  return { latitude: n(g.latitude), longitude: n(g.longitude), radiusM: n(g.radiusM) };
}
