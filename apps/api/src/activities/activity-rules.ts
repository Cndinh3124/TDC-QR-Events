// Quy tac thuan (khong cham DB) cua module hoat dong: may trang thai, chuan hoa link, ma, so sanh phien ban
// Dac ta quan-ly-hoat-dong 3.1, 3.2, 4.1.
import { createHash } from 'crypto';
import { Err } from '../common/errors';
import { ActivityStatus } from './entities/activity.entity';
import { LinkGroup } from './entities/activity-parts.entity';

export const LINK_LIMIT_PER_GROUP = 5; // [YC] toi da 5 link moi nhom
export const URL_MAX = 2048;

// nhan hien thi cua trang thai (giao dien dung cung bang nay)
export const STATUS_LABEL: Record<ActivityStatus, string> = {
  DRAFT: 'Nháp', PENDING_PLAN: 'Chờ duyệt kế hoạch', IN_PROGRESS: 'Đang triển khai',
  PENDING_EVAL: 'Chờ đánh giá', EVALUATED: 'Đã đánh giá', LOCKED: 'Đã chốt',
};

// trang thai nguoi nop duoc sua noi dung; QTV truong sua them o hai trang thai dang cho duyet / danh gia
const OWNER_EDITABLE: ActivityStatus[] = ['DRAFT', 'IN_PROGRESS'];
const ADMIN_EDITABLE: ActivityStatus[] = ['DRAFT', 'PENDING_PLAN', 'IN_PROGRESS', 'PENDING_EVAL'];
export const canEditStatus = (status: ActivityStatus, isAdmin: boolean) =>
  (isAdmin ? ADMIN_EDITABLE : OWNER_EDITABLE).includes(status);

// hanh dong quy trinh -> trang thai nguon hop le
export type WorkflowAction = 'SUBMIT' | 'APPROVE' | 'RETURN' | 'SUBMIT_RESULT' | 'EVALUATE' | 'REWARD' | 'REOPEN';
export const SOURCE_STATUS: Record<WorkflowAction, ActivityStatus[]> = {
  SUBMIT: ['DRAFT'],
  APPROVE: ['PENDING_PLAN'],
  RETURN: ['PENDING_PLAN', 'PENDING_EVAL'],
  SUBMIT_RESULT: ['IN_PROGRESS'],
  EVALUATE: ['PENDING_EVAL'],
  REWARD: ['EVALUATED'],
  REOPEN: ['LOCKED'],
};

export function assertTransition(action: WorkflowAction, status: ActivityStatus): void {
  if (!SOURCE_STATUS[action].includes(status)) {
    throw Err.conflict('INVALID_STATE', `Hồ sơ đang ở trạng thái "${STATUS_LABEL[status]}", không thực hiện được thao tác này.`);
  }
}

// ma hoat dong: [nam]-[STT 3 chu so] (tu 1000 tro len tu dong thanh 4 chu so)
export const formatCode = (year: number, n: number) => `${year}-${String(n).padStart(3, '0')}`;

// ten mien quen thuoc: ngoai danh sach van nhan nhung gan "can kiem tra" - dac ta 3.2
const TRUSTED = ['facebook.com', 'fb.watch', 'fb.com', 'youtube.com', 'youtu.be', 'tiktok.com', 'drive.google.com', 'docs.google.com', 'photos.google.com', 'tdc.edu.vn', 'instagram.com', 'zalo.me'];

export interface CleanLink { url: string; urlHash: string; needsReview: boolean }

// [BM] chi https, toi da 2048 ky tu, khong chua khoang trang / ky tu dieu khien; he thong khong tu mo link
export function cleanUrl(raw: string): CleanLink {
  const url = raw.trim();
  if (url.length === 0 || url.length > URL_MAX) throw Err.bad('INVALID_URL', `Đường dẫn tối đa ${URL_MAX} ký tự.`);
  if (/[\s\p{Cc}]/u.test(url)) throw Err.bad('INVALID_URL', 'Đường dẫn không được chứa khoảng trắng.');
  let u: URL;
  try { u = new URL(url); } catch { throw Err.bad('INVALID_URL', `Đường dẫn không hợp lệ: ${url.slice(0, 60)}`); }
  if (u.protocol !== 'https:') throw Err.bad('INVALID_URL', 'Chỉ nhận đường dẫn https://.');
  if (u.username || u.password) throw Err.bad('INVALID_URL', 'Đường dẫn không được kèm tên đăng nhập.');
  const host = u.hostname.toLowerCase();
  const needsReview = !TRUSTED.some((d) => host === d || host.endsWith(`.${d}`));
  return { url, urlHash: createHash('sha256').update(u.toString()).digest('hex'), needsReview };
}

export interface LinkInput { group: LinkGroup; url: string }

// kiem tra ca danh sach: toi da 5 / nhom, khong trung (so sanh sau chuan hoa)
export function checkLinkSet<T extends LinkInput>(links: T[]): Array<T & CleanLink> {
  const count: Record<string, number> = {};
  const seen = new Set<string>();
  return links.map((l) => {
    const c = cleanUrl(l.url);
    count[l.group] = (count[l.group] ?? 0) + 1;
    if (count[l.group] > LINK_LIMIT_PER_GROUP) throw Err.bad('TOO_MANY_LINKS', `Mỗi nhóm tối đa ${LINK_LIMIT_PER_GROUP} đường dẫn.`);
    if (seen.has(c.urlHash)) throw Err.bad('DUPLICATE_LINK', 'Có đường dẫn bị trùng trong cùng hoạt động.');
    seen.add(c.urlHash);
    return { ...l, ...c };
  });
}

// so sanh hai ban chup -> chi cac truong da doi (dung cho lich su phien ban)
export function diffSnapshots(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) out[k] = { from: before[k] ?? null, to: after[k] ?? null };
  }
  return out;
}
