// Tong quan (KPI, bieu do, su kien dang dien ra) va nhac viec cho nguoi duyet - dac ta 3.6, 10
// Chi dung GROUP BY / COUNT trong SQL, khong tai du lieu len bo nho (chot-backend-hieu-nang.md muc 7).
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../common/current-user';
import { Err } from '../common/errors';
import { UnitScopeService } from '../common/unit-scope.service';
import { Event } from '../events/entities/event.entity';
import { checkinState } from '../events/event-rules';
import { EventsService } from '../events/events.service';
import { Overview, OverviewQuery, Reminders } from './dashboard.dto';

const VN_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 24 * 3600_000;
const MAX_DAYS = 366;
const DEFAULT_DAYS = 30;
const LIVE_LIMIT = 20;
const RECENT_LIMIT = 10;
const REMINDER_LIMIT = 50;
// khieu nai con <= 2 ngay la "sap het han" (da qua han van con xu ly duoc nen van nhac)
const APPEAL_SOON_MS = 2 * DAY_MS;

interface Scope {
  events: string[] | null; // su kien nhin thay duoc; null = khong gioi han
  units: string[] | null; // khoa nhin thay duoc; null = khong gioi han
}

const ph = (a: unknown[]) => a.map(() => '?').join(',') || "''";
const vnDay = (ms: number) => new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);

// ngay YYYY-MM-DD (gio VN) -> moc 00:00 gio VN; sai ngay (vd 2026-02-31) thi bao loi
function dayStart(day: string): number {
  const t = new Date(`${day}T00:00:00+07:00`).getTime();
  if (Number.isNaN(t) || vnDay(t) !== day) throw Err.bad('INVALID_RANGE', 'Ngày không hợp lệ.');
  return t;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scope: UnitScopeService,
    private readonly events: EventsService,
  ) {}

  async overview(actor: CurrentUser, q: OverviewQuery): Promise<Overview> {
    // B1 [BM]: pham vi + khoang ngay hop le
    const s = await this.scopeOf(actor, q);
    const now = Date.now();
    const to = q.to ?? vnDay(now);
    const from = q.from ?? vnDay(dayStart(to) - (DEFAULT_DAYS - 1) * DAY_MS);
    const fromMs = dayStart(from);
    const toMs = dayStart(to) + DAY_MS; // khoang [from, to + 1 ngay)
    if (toMs <= fromMs) throw Err.bad('INVALID_RANGE', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    const days = Math.round((toMs - fromMs) / DAY_MS);
    if (days > MAX_DAYS) throw Err.bad('INVALID_RANGE', `Khoảng thời gian tối đa ${MAX_DAYS} ngày.`);

    // B2: cac so lieu doc lap nhau, chay song song
    const prevFrom = fromMs - (toMs - fromMs);
    const [cur, prev, daily, byFaculty, pendingReview, openAppeals, live, recent] = await Promise.all([
      this.totals(s, q, fromMs, toMs),
      this.totals(s, q, prevFrom, fromMs),
      this.daily(s, q, fromMs, toMs),
      this.byFaculty(s, q, fromMs, toMs),
      this.countPendingReview(s, q),
      this.countOpenAppeals(s, q),
      this.liveEvents(s, q),
      this.recentEvents(s, q),
    ]);
    const rate = (t: { attendance: number; onTime: number }) => (t.attendance > 0 ? t.onTime / t.attendance : null);
    return {
      range: { from, to, days },
      kpis: {
        attendance: { value: cur.attendance, previous: prev.attendance },
        onTimeRate: { value: rate(cur), previous: rate(prev) },
        students: { value: cur.students, previous: prev.students },
        drl: { value: cur.drl, previous: prev.drl },
        pendingReview,
        openAppeals,
      },
      daily: this.fillDays(daily, fromMs, days),
      byFaculty,
      live,
      recent,
    };
  }

  // [NV] 3.6: nhac nguoi duyet khi su kien da ket thuc con luot chua duyet, va khi khieu nai sap het han.
  // Chi tinh su kien do don vi cua minh to chuc (quyen duyet), khong tinh su kien chi-xem.
  async reminders(actor: CurrentUser): Promise<Reminders> {
    const units = await this.scope.visibleUnitIds(actor);
    if (units && units.length === 0) return { pendingReview: [], appealsDue: [] };
    const unitSql = units ? `AND e.unit_id IN (${ph(units)})` : '';
    const unitArgs = units ?? [];
    const now = new Date();

    const [reviews, appeals] = await Promise.all([
      this.ds.query(
        `SELECT e.id AS eventId, e.title, e.end_at AS endAt, e.status, COUNT(a.id) AS pendingCount
           FROM events e JOIN attendances a ON a.event_id = e.id AND a.review_status = 'PENDING' AND a.voided_at IS NULL
          WHERE e.archived_at IS NULL AND e.status NOT IN ('DRAFT', 'CANCELLED', 'FINALIZED') AND e.end_at < ? ${unitSql}
          GROUP BY e.id, e.title, e.end_at, e.status ORDER BY e.end_at ASC LIMIT ${REMINDER_LIMIT}`,
        [now, ...unitArgs],
      ),
      this.ds.query(
        `SELECT p.id AS appealId, e.id AS eventId, e.title AS eventTitle, p.mssv, p.full_name AS fullName, p.deadline_at AS deadlineAt
           FROM appeals p JOIN events e ON e.id = p.event_id
          WHERE p.status = 'PENDING' AND p.deadline_at <= ? ${unitSql}
          ORDER BY p.deadline_at ASC LIMIT ${REMINDER_LIMIT}`,
        [new Date(now.getTime() + APPEAL_SOON_MS), ...unitArgs],
      ),
    ]);
    return {
      pendingReview: reviews.map((r: any) => ({ ...r, pendingCount: Number(r.pendingCount) })),
      appealsDue: appeals.map((r: any) => ({ ...r, overdue: new Date(r.deadlineAt) < now })),
    };
  }

  // ---------- noi bo ----------

  // [BM] 8.2: su kien + khoa nguoi dung duoc thay; id nam ngoai pham vi tra 404 (khong lo su ton tai)
  private async scopeOf(actor: CurrentUser, q: OverviewQuery): Promise<Scope> {
    const events = await this.events.visibleEventIds(actor);
    const units = await this.scope.visibleUnitIds(actor);
    if (q.eventId && events && !events.includes(q.eventId)) throw Err.notFound('sự kiện');
    if (q.facultyUnitId && units && !units.includes(q.facultyUnitId)) throw Err.notFound('khoa');
    return { events, units };
  }

  // dieu kien tren bang attendances (alias a): luot chua huy, trong pham vi, theo bo loc
  private attFilter(s: Scope, q: OverviewQuery): { sql: string; args: unknown[] } {
    const sql = ['a.voided_at IS NULL'];
    const args: unknown[] = [];
    if (s.events) { sql.push(`a.event_id IN (${ph(s.events)})`); args.push(...s.events); }
    if (s.units) { sql.push(`a.faculty_unit_id IN (${ph(s.units)})`); args.push(...s.units); }
    if (q.eventId) { sql.push('a.event_id = ?'); args.push(q.eventId); }
    if (q.facultyUnitId) { sql.push('a.faculty_unit_id = ?'); args.push(q.facultyUnitId); }
    return { sql: sql.join(' AND '), args };
  }

  // [NV] sinh vien da gop MSSV tinh la mot nguoi (giong bao cao DRL)
  private async totals(s: Scope, q: OverviewQuery, fromMs: number, toMs: number) {
    const f = this.attFilter(s, q);
    const [r] = await this.ds.query(
      `SELECT COUNT(*) AS attendance, COALESCE(SUM(a.timeliness = 'ON_TIME'), 0) AS onTime,
              COUNT(DISTINCT COALESCE(t.merged_into, a.mssv)) AS students, COALESCE(SUM(a.drl_awarded), 0) AS drl
         FROM attendances a LEFT JOIN students t ON t.mssv = a.mssv
        WHERE ${f.sql} AND a.checkin_at >= ? AND a.checkin_at < ?`,
      [...f.args, new Date(fromMs), new Date(toMs)],
    );
    return { attendance: Number(r.attendance), onTime: Number(r.onTime), students: Number(r.students), drl: Number(r.drl) };
  }

  private async daily(s: Scope, q: OverviewQuery, fromMs: number, toMs: number) {
    const f = this.attFilter(s, q);
    const rows = await this.ds.query(
      `SELECT DATE_FORMAT(DATE_ADD(a.checkin_at, INTERVAL 7 HOUR), '%Y-%m-%d') AS d, COUNT(*) AS attendance,
              SUM(a.timeliness = 'ON_TIME') AS onTime
         FROM attendances a WHERE ${f.sql} AND a.checkin_at >= ? AND a.checkin_at < ? GROUP BY d`,
      [...f.args, new Date(fromMs), new Date(toMs)],
    );
    return new Map<string, { attendance: number; onTime: number }>(
      rows.map((r: any) => [r.d, { attendance: Number(r.attendance), onTime: Number(r.onTime) }]),
    );
  }

  // du moi ngay trong khoang, ngay khong co luot hien 0 (bieu do khong bi dut)
  private fillDays(map: Map<string, { attendance: number; onTime: number }>, fromMs: number, days: number) {
    return Array.from({ length: days }, (_, i) => {
      const date = vnDay(fromMs + i * DAY_MS);
      return { date, ...(map.get(date) ?? { attendance: 0, onTime: 0 }) };
    });
  }

  // [NV] chot-giao-dien.md muc 1: luon du cac khoa dang hoat dong, ke ca khoa 0 luot
  private async byFaculty(s: Scope, q: OverviewQuery, fromMs: number, toMs: number) {
    const f = this.attFilter(s, q);
    const where = ["u.type = 'FACULTY'", 'u.is_active = 1'];
    const args: unknown[] = [];
    if (s.units) { where.push(`u.id IN (${ph(s.units)})`); args.push(...s.units); }
    if (q.facultyUnitId) { where.push('u.id = ?'); args.push(q.facultyUnitId); }
    const rows = await this.ds.query(
      `SELECT u.id AS facultyId, u.name AS faculty, COUNT(a.id) AS attendance, COALESCE(SUM(a.drl_awarded), 0) AS drl
         FROM units u LEFT JOIN attendances a ON a.faculty_unit_id = u.id AND ${f.sql} AND a.checkin_at >= ? AND a.checkin_at < ?
        WHERE ${where.join(' AND ')} GROUP BY u.id, u.name ORDER BY u.name`,
      [...f.args, new Date(fromMs), new Date(toMs), ...args],
    );
    return rows.map((r: any) => ({ facultyId: r.facultyId, faculty: r.faculty, attendance: Number(r.attendance), drl: Number(r.drl) }));
  }

  // luot cho duyet cua su kien minh quan ly (khong tinh su kien chi-xem), da dong diem danh, chua chot
  private async countPendingReview(s: Scope, q: OverviewQuery): Promise<number> {
    const units = s.units;
    const where = [
      "a.review_status = 'PENDING'", 'a.voided_at IS NULL', 'e.archived_at IS NULL',
      "e.status IN ('CHECKIN_CLOSED', 'REVIEWING')",
    ];
    const args: unknown[] = [];
    if (units) { where.push(`e.unit_id IN (${ph(units)})`); args.push(...units); }
    if (q.eventId) { where.push('e.id = ?'); args.push(q.eventId); }
    if (q.facultyUnitId) { where.push('a.faculty_unit_id = ?'); args.push(q.facultyUnitId); }
    const [r] = await this.ds.query(
      `SELECT COUNT(*) AS n FROM attendances a JOIN events e ON e.id = a.event_id WHERE ${where.join(' AND ')}`,
      args,
    );
    return Number(r.n);
  }

  private async countOpenAppeals(s: Scope, q: OverviewQuery): Promise<number> {
    const where = ["p.status = 'PENDING'"];
    const args: unknown[] = [];
    if (s.units) { where.push(`e.unit_id IN (${ph(s.units)})`); args.push(...s.units); }
    if (q.eventId) { where.push('e.id = ?'); args.push(q.eventId); }
    if (q.facultyUnitId) { where.push('p.faculty_unit_id = ?'); args.push(q.facultyUnitId); }
    const [r] = await this.ds.query(
      `SELECT COUNT(*) AS n FROM appeals p JOIN events e ON e.id = p.event_id WHERE ${where.join(' AND ')}`,
      args,
    );
    return Number(r.n);
  }

  // su kien dang mo diem danh THAT (dung checkinState, khong tu doan tu status), so dem doc tu event_counters
  private async liveEvents(s: Scope, q: OverviewQuery) {
    if (s.events && s.events.length === 0) return [];
    const qb = this.ds.getRepository(Event).createQueryBuilder('e').leftJoinAndSelect('e.unit', 'u')
      .where('e.archivedAt IS NULL').andWhere("e.status IN ('PUBLISHED', 'CHECKIN_OPEN')");
    if (s.events) qb.andWhere('e.id IN (:...ids)', { ids: s.events });
    if (q.eventId) qb.andWhere('e.id = :eventId', { eventId: q.eventId });
    const now = new Date();
    const open = (await qb.orderBy('e.startAt', 'ASC').take(100).getMany()).filter((e) => checkinState(e, now) === 'OPEN').slice(0, LIVE_LIMIT);
    if (open.length === 0) return [];
    const rows = await this.ds.query(
      `SELECT event_id AS eventId, SUM(checkin_count) AS checkinCount, SUM(checkout_count) AS checkoutCount,
              SUM(on_time_count) AS onTimeCount, SUM(late_count) AS lateCount
         FROM event_counters WHERE event_id IN (${ph(open)}) GROUP BY event_id`,
      open.map((e) => e.id),
    );
    const by = new Map<string, any>(rows.map((r: any) => [r.eventId, r]));
    return open.map((e) => {
      const c = by.get(e.id);
      return {
        id: e.id, title: e.title, unitName: e.unit?.name ?? null, startAt: e.startAt, endAt: e.endAt,
        checkinCount: Number(c?.checkinCount ?? 0), checkoutCount: Number(c?.checkoutCount ?? 0),
        onTimeCount: Number(c?.onTimeCount ?? 0), lateCount: Number(c?.lateCount ?? 0),
      };
    });
  }

  private async recentEvents(s: Scope, q: OverviewQuery) {
    if (s.events && s.events.length === 0) return [];
    const qb = this.ds.getRepository(Event).createQueryBuilder('e').leftJoinAndSelect('e.unit', 'u')
      .where('e.archivedAt IS NULL').andWhere("e.status <> 'DRAFT'");
    if (s.events) qb.andWhere('e.id IN (:...ids)', { ids: s.events });
    if (q.eventId) qb.andWhere('e.id = :eventId', { eventId: q.eventId });
    const list = await qb.orderBy('e.startAt', 'DESC').take(RECENT_LIMIT).getMany();
    if (list.length === 0) return [];
    const rows = await this.ds.query(
      `SELECT event_id AS eventId, COUNT(*) AS n FROM attendances WHERE voided_at IS NULL AND event_id IN (${ph(list)}) GROUP BY event_id`,
      list.map((e) => e.id),
    );
    const n = new Map<string, number>(rows.map((r: any) => [r.eventId, Number(r.n)]));
    return list.map((e) => ({
      id: e.id, title: e.title, unitName: e.unit?.name ?? null, startAt: e.startAt, status: e.status, attendanceCount: n.get(e.id) ?? 0,
    }));
  }
}
