// Ham thuan cho luat gan co va chuan hoa du lieu diem danh (khong cham DB) - dac ta 3.8, 5.3
import { BURST_MIN_MSSV, BURST_WINDOW_MS } from './public.constants';

// [NV] 3.8: bo khoang trang, chu hoa truoc khi kiem tra va luu
export function normalizeMssv(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

// [NV] 5.3: bo dau, chu thuong, gop khoang trang
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// [NV] 5.3: lech <= 2 ky tu coi la khop (go nham nho)
export const isSimilar = (a: string, b: string): boolean => levenshtein(a, b) <= 2;

// khoang cach mat cau (met) giua hai toa do
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

export interface BurstRow {
  id: string;
  mssv: string;
  at: number; // ms
}

// [NV] 5.3: >= 3 MSSV khac nhau trong 60 giay (cung IP + fingerprint, da loc o SQL).
// Tra id cac luot nam trong mot cua so nhu the va co chua luot `pivotId`.
export function findBurst(rows: BurstRow[], pivotId: string): string[] {
  const sorted = [...rows].sort((a, b) => a.at - b.at);
  const hit = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const win = sorted.filter((r) => r.at >= sorted[i].at && r.at - sorted[i].at <= BURST_WINDOW_MS);
    if (new Set(win.map((r) => r.mssv)).size >= BURST_MIN_MSSV && win.some((r) => r.id === pivotId)) {
      win.forEach((r) => hit.add(r.id));
    }
  }
  return [...hit];
}
