// Bieu do cot don gian bang SVG (khong them thu vien). Moi cot co <title> de xem so khi re chuot.
import { dmy } from '../format';

interface Props {
  data: Array<{ date: string; attendance: number; onTime: number }>;
}

const W = 760;
const H = 200;
const PAD = { l: 36, r: 8, t: 8, b: 26 };

// lam tron len so "dep" de truc tung co nhan de doc
function niceMax(n: number): number {
  if (n <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / p) * p;
}

export function DailyChart({ data }: Props) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.attendance)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / data.length;
  const step = Math.ceil(data.length / 8);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Số lượt điểm danh theo ngày" style={{ display: 'block' }}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--divider)" />
          <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">{Math.round(max * f)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = PAD.l + i * bw;
        const late = d.attendance - d.onTime;
        return (
          <g key={d.date}>
            <title>{`${dmy(d.date)}: ${d.attendance} lượt (${d.onTime} đúng giờ, ${late} trễ)`}</title>
            <rect x={x + bw * 0.15} width={bw * 0.7} y={y(d.onTime)} height={(d.onTime / max) * ih} fill="var(--primary)" rx="2" />
            <rect x={x + bw * 0.15} width={bw * 0.7} y={y(d.attendance)} height={(late / max) * ih} fill="#f0b45a" rx="2" />
            {i % step === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--faint)">{dmy(d.date).slice(0, 5)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// thanh ngang theo khoa
export function FacultyBars({ rows }: { rows: Array<{ facultyId: string; faculty: string; attendance: number; drl: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.attendance));
  return (
    <div>
      {rows.map((r) => (
        <div key={r.facultyId} className="hbar" title={`${r.faculty}: ${r.attendance} lượt, ${r.drl} điểm ĐRL`}>
          <span className="hbar-name">{r.faculty.replace(/^Khoa /, '')}</span>
          <span className="hbar-track"><span style={{ width: `${(r.attendance / max) * 100}%` }} /></span>
          <b>{r.attendance}</b>
        </div>
      ))}
    </div>
  );
}
