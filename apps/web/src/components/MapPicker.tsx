// Ban do chon toa do diem danh (Leaflet + OpenStreetMap qua CARTO) - dac ta 9, 10.
// Bam len ban do hoac keo dau ghim de dat diem; vong tron the hien ban kinh cho phep.
// Tai rieng (React.lazy) vi chi man quan tri can; trang diem danh cua sinh vien khong keo theo Leaflet.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

interface Props {
  latitude: number | null;
  longitude: number | null;
  radiusM: number | null;
  onPick?: (lat: number, lng: number) => void; // khong truyen = chi xem
  height?: number;
}

// gan khu vuc truong TDC lam diem nhin mac dinh khi chua chon (khong tu dat toa do)
const DEFAULT_CENTER: [number, number] = [10.8508, 106.7717];

// dau ghim ve bang CSS: tranh phai nap anh icon mac dinh cua Leaflet (hay vo duong dan khi dong goi)
const pin = L.divIcon({ className: 'map-pin', iconSize: [22, 22], iconAnchor: [11, 11] });

export function MapPicker({ latitude, longitude, radiusM, onPick, height = 280 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // khoi tao ban do mot lan
  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { scrollWheelZoom: false }).setView(
      latitude !== null && longitude !== null ? [latitude, longitude] : DEFAULT_CENTER,
      latitude !== null ? 17 : 15,
    );
    // CARTO (du lieu OSM): tile.openstreetmap.org bi mot so nha mang VN chan (DNS + reset TLS)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    }).addTo(m);
    if (onPickRef.current) m.on('click', (e: L.LeafletMouseEvent) => onPickRef.current?.(round(e.latlng.lat), round(e.latlng.lng)));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
      circle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chi khoi tao mot lan; cap nhat o effect duoi
  }, []);

  // dong bo ghim + vong tron voi gia tri o form
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (latitude === null || longitude === null) {
      marker.current?.remove();
      circle.current?.remove();
      marker.current = null;
      circle.current = null;
      return;
    }
    const at: [number, number] = [latitude, longitude];
    if (!marker.current) {
      marker.current = L.marker(at, { icon: pin, draggable: !!onPickRef.current }).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng();
        onPickRef.current?.(round(p.lat), round(p.lng));
      });
      m.setView(at, Math.max(m.getZoom(), 17));
    } else {
      marker.current.setLatLng(at);
    }
    if (radiusM && radiusM > 0) {
      if (!circle.current) circle.current = L.circle(at, { radius: radiusM, color: '#1f66d1', weight: 2, fillOpacity: 0.12 }).addTo(m);
      else circle.current.setLatLng(at).setRadius(radiusM);
    } else {
      circle.current?.remove();
      circle.current = null;
    }
  }, [latitude, longitude, radiusM]);

  return <div ref={box} className="map" style={{ height }} role="application" aria-label="Bản đồ chọn vị trí điểm danh" />;
}

// API chi nhan toi da 6 chu so thap phan
const round = (n: number) => Math.round(n * 1e6) / 1e6;
