// Client goi API quan tri. [BM] access token chi giu trong bo nho (khong localStorage);
// refresh token la cookie httpOnly nen tai lai trang thi goi /refresh de lay lai phien.

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'SCHOOL_ADMIN' | 'FACULTY_MANAGER';
  unitId: string;
  mustChangePassword: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CHECKIN_OPEN' | 'CHECKIN_CLOSED' | 'REVIEWING' | 'FINALIZED' | 'CANCELLED';

export type FacultyViewMode = 'NONE' | 'ALL' | 'SELECTED';
export type CheckinState = 'NOT_AVAILABLE' | 'NOT_YET' | 'OPEN' | 'CLOSED';

export interface EventItem {
  id: string;
  unit: { id: string; name: string; code: string; type: 'SCHOOL' | 'FACULTY' } | null;
  title: string;
  description: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusM: number | null;
  startAt: string;
  endAt: string;
  checkinOpenAt: string;
  checkinCloseAt: string;
  hasDrl: boolean;
  drlPoints: number | null;
  controlLevel: 'NORMAL' | 'TIGHT';
  requireCheckout: boolean;
  graceMinutes: number;
  hasVerifyCode: boolean;
  facultyViewMode: FacultyViewMode;
  // cac khoa duoc chon (che do SELECTED); null khi dang o danh sach hoac khong co quyen xem
  facultyViewUnitIds: string[] | null;
  canManage: boolean;
  status: EventStatus;
  checkinState: CheckinState;
  cancelReason: string | null;
  archivedAt: string | null;
}

export interface Unit {
  id: string;
  name: string;
  code: string;
  type: 'SCHOOL' | 'FACULTY';
  isActive?: boolean;
}

export interface QrInfo {
  purpose: 'CHECKIN' | 'CHECKOUT';
  token: string;
  url: string;
  createdAt: string;
}

export interface Counters {
  checkinCount: number;
  checkoutCount: number;
  onTimeCount: number;
  lateCount: number;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSessionLost: () => void = () => {};
let refreshing: Promise<boolean> | null = null;

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

async function toError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  return new ApiError(res.status, body?.code ?? 'ERROR', body?.message ?? 'Có lỗi xảy ra, vui lòng thử lại.');
}

// gop nhieu request cung luc het han thanh mot lan refresh (token xoay vong, goi 2 lan se that bai)
function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/admin/auth/refresh', { method: 'POST' })
    .then(async (res) => {
      if (!res.ok) return false;
      accessToken = (await res.json()).accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(path: string, init: RequestInit, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401 && retry && (await refresh())) return send(path, init, false);
  if (res.status === 401) onSessionLost();
  return res;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw await toError(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

// anh QR can header Authorization nen tai ve dang blob roi tao object URL
export async function fetchBlobUrl(path: string): Promise<string> {
  const res = await send(path, {});
  if (!res.ok) throw await toError(res);
  return URL.createObjectURL(await res.blob());
}

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toError(res);
  const data = await res.json();
  accessToken = data.accessToken;
  return data.user;
}

export async function restoreSession(): Promise<User | null> {
  if (!(await refresh())) return null;
  return api<User>('GET', '/admin/auth/me');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<User> {
  const data = await api<{ accessToken: string; user: User }>('PATCH', '/admin/auth/password', { currentPassword, newPassword });
  accessToken = data.accessToken;
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch('/api/admin/auth/logout', { method: 'POST' }).catch(() => {});
  accessToken = null;
}

// ---------- giai doan 4: duyet, khieu nai, sinh vien, bao cao ----------

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AttendanceRow {
  id: string;
  mssv: string;
  fullName: string;
  email: string | null;
  faculty: { id: string; name: string } | null;
  checkinAt: string;
  checkoutAt: string | null;
  timeliness: 'ON_TIME' | 'LATE';
  source: 'SELF' | 'MANUAL';
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  drlAwarded: number | null;
  confirmCode: string | null;
  editCount: number;
  distanceM: number | null;
  deviceRef: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  flags: Array<{ code: string; detail: Record<string, unknown> | null }>;
}

// [NV] A07: ngan keo chi tiet mot luot
export interface AttendanceDetail {
  attendance: AttendanceRow;
  edits: Array<{
    at: string;
    actorType: 'STUDENT' | 'ADMIN';
    actorName: string | null;
    reason: string | null;
    changes: Array<{ field: string; from: string | null; to: string | null }>;
  }>;
  otherAttendances: Array<{
    attendanceId: string;
    eventId: string;
    eventTitle: string;
    eventStartAt: string;
    checkinAt: string;
    mssv: string;
    reviewStatus: ReviewStatus;
    voided: boolean;
    drlAwarded: number | null;
  }>;
}

export interface AttendanceSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  voided: number;
  flagged: number;
  cleanPending: number;
  noCheckout: number;
}

export type AppealType = 'WRONG_INFO' | 'NO_CHECKIN' | 'PROXY_CHECKIN' | 'DUPLICATE_MSSV';
export type AppealStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface AppealItem {
  id: string;
  event: { id: string; title: string };
  attendanceId: string | null;
  mssv: string;
  fullName: string | null;
  type: AppealType;
  content: string;
  status: AppealStatus;
  deadlineAt: string;
  handledAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface StudentItem {
  mssv: string;
  fullName: string;
  faculty: { id: string; name: string } | null;
  firstSeenAt: string;
  mergedInto: string | null;
  attendanceCount: number;
  totalDrl: number;
}

export interface StudentHistoryItem {
  attendanceId: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: string;
  checkinAt: string;
  reviewStatus: ReviewStatus;
  drlAwarded: number | null;
  voided: boolean;
}

export interface DrlReport {
  by: 'student' | 'faculty';
  items: Array<Record<string, string | number>>;
  total: number;
  page: number;
  limit: number;
  totalDrl: number;
}

// tai tep ve may (vd. Excel) qua fetch co token, roi kich hoat tai xuong
export async function download(path: string, filename: string): Promise<void> {
  const url = await fetchBlobUrl(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const qs = (o: Record<string, string | number | undefined | null>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

// ---------- giai doan 5: tong quan, nhac viec, quan tri he thong ----------

export interface Compared {
  value: number;
  previous: number;
}

export interface Overview {
  range: { from: string; to: string; days: number };
  kpis: {
    attendance: Compared;
    onTimeRate: { value: number | null; previous: number | null };
    students: Compared;
    drl: Compared;
    pendingReview: number;
    openAppeals: number;
  };
  daily: Array<{ date: string; attendance: number; onTime: number }>;
  byFaculty: Array<{ facultyId: string; faculty: string; attendance: number; drl: number }>;
  live: Array<{
    id: string; title: string; unitName: string | null; startAt: string; endAt: string;
    checkinCount: number; checkoutCount: number; onTimeCount: number; lateCount: number;
  }>;
  recent: Array<{ id: string; title: string; unitName: string | null; startAt: string; status: EventStatus; attendanceCount: number }>;
}

export interface Reminders {
  pendingReview: Array<{ eventId: string; title: string; endAt: string; status: EventStatus; pendingCount: number }>;
  appealsDue: Array<{
    appealId: string; eventId: string; eventTitle: string; mssv: string; fullName: string | null; deadlineAt: string; overdue: boolean;
  }>;
}

export interface UserItem {
  id: string;
  email: string;
  fullName: string;
  role: User['role'];
  unitId: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditItem {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

// ---------- giai doan 6: quan ly hoat dong ----------

export type ActivityStatus = 'DRAFT' | 'PENDING_PLAN' | 'IN_PROGRESS' | 'PENDING_EVAL' | 'EVALUATED' | 'LOCKED';
export type Evaluation = 'COMPLETED' | 'NOT_COMPLETED';
export type Reward = 'APPROVED' | 'REJECTED';
export type LinkGroup = 'MEDIA' | 'PUBLICATION' | 'RESULT';
export type LinkType = 'FACEBOOK' | 'VIDEO' | 'PHOTO' | 'INFOGRAPHIC' | 'NEWS' | 'OTHER';

export interface ActivityLink {
  id: string;
  group: LinkGroup;
  type: LinkType;
  url: string;
  publishedOn: string | null;
  needsReview: boolean;
}

export interface Activity {
  id: string;
  code: string;
  academicYear: { id: string; name: string } | null;
  unit: { id: string; name: string; code: string } | null;
  category: { id: string; name: string } | null;
  level: 'SCHOOL' | 'FACULTY' | 'CLASS';
  name: string;
  startAt: string;
  endAt: string;
  location: string | null;
  mode: 'ONSITE' | 'ONLINE' | 'HYBRID';
  targetAudience: string | null;
  expectedCount: number | null;
  actualCount: number | null;
  actualSource: 'ATTENDANCE' | 'MANUAL' | null;
  manualCount: number | null;
  budgetPlanned: number | null;
  budgetActual: number | null;
  ownerName: string | null;
  ownerPhone: string | null;
  planUrl: string | null;
  note: string | null;
  status: ActivityStatus;
  returnNote: string | null;
  returnedAt: string | null;
  submittedAt: string | null;
  evaluation: Evaluation | null;
  evaluationNote: string | null;
  evaluatedAt: string | null;
  reward: Reward | null;
  rewardNote: string | null;
  lockedAt: string | null;
  counts: { media: number; publication: number; result: number };
  coUnits: Array<{ id: string; name: string }>;
  links?: ActivityLink[];
  events?: Array<{ id: string; title: string; startAt: string; attendanceCount: number }>;
  canEdit: boolean;
  canSubmit: boolean;
  canReview: boolean;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  planDeadline: string | null;
  reportDeadline: string | null;
  locked: boolean;
  lockedAt: string | null;
}

export interface ActivityCategory {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
}

export interface TimelineItem {
  kind: 'WORKFLOW' | 'VERSION';
  at: string;
  actor: string | null;
  action: string;
  note: string | null;
  version: number | null;
  diff: Record<string, { from: unknown; to: unknown }> | null;
}

export interface ChecklistCriterion {
  key: string;
  label: string;
  auto: boolean;
  passed: boolean | null;
}

export interface ActivityComment {
  id: string;
  author: string | null;
  content: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
}

export interface BulkResult {
  done: string[];
  failed: Array<{ id: string; message: string }>;
}

export interface ActivityGroup {
  key: string;
  label: string;
  total: number;
  completed: number;
  notCompleted: number;
  withMedia: number;
  participants: number;
}

export interface ActivityStats {
  year: { id: string; name: string };
  kpi: {
    total: number; evaluated: number; completed: number; notCompleted: number; completionRate: number | null; rewarded: number;
    participants: number; withMedia: number; missingMedia: number; mediaLinks: number; publicationLinks: number;
    budgetPlanned: number; budgetActual: number;
  };
  byStatus: Record<string, number>;
  byUnit: ActivityGroup[];
  byCategory: ActivityGroup[];
  byMonth: ActivityGroup[];
}
