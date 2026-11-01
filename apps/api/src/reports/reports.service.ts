// Bao cao tong hop ĐRL theo sinh vien / theo khoa va xuat Excel - dac ta 3.6, 8.3
// Chi tinh luot da duyet, khong huy, thuoc su kien DA CHOT; MSSV da gop tinh vao MSSV chinh.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Err } from '../common/errors';
import { UnitScopeService } from '../common/unit-scope.service';
import { EventsService } from '../events/events.service';
import { DrlFacultyRow, DrlReportQuery, DrlStudentRow } from './reports.dto';

const EXPORT_MAX_ROWS = 20_000;

export interface DrlReport {
  by: 'student' | 'faculty';
  items: Array<DrlStudentRow | DrlFacultyRow>;
  total: number;
  page: number;
  limit: number;
  totalDrl: number;
}

// [BM] 8.3: chan formula injection - o bat dau bang = + - @ (hoac tab / CR) duoc them dau ' phia truoc
export function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scope: UnitScopeService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  async drl(actor: CurrentUser, q: DrlReportQuery): Promise<DrlReport> {
    const f = await this.filters(actor, q);
    if (q.by === 'faculty') {
      const items = await this.byFaculty(f, q);
      return { by: 'faculty', items, total: items.length, page: 1, limit: items.length, totalDrl: items.reduce((t, r) => t + r.totalDrl, 0) };
    }
    const [{ n, drl }] = await this.ds.query(
      `SELECT COUNT(DISTINCT b.canon) AS n, COALESCE(SUM(b.drl), 0) AS drl FROM (${f.base}) b JOIN students t ON t.mssv = b.canon ${f.studentWhere}`,
      [...f.baseArgs, ...f.studentArgs],
    );
    const items = await this.byStudent(f, q.limit, (q.page - 1) * q.limit);
    return { by: 'student', items, total: Number(n), page: q.page, limit: q.limit, totalDrl: Number(drl) };
  }

  async exportXlsx(actor: CurrentUser, q: DrlReportQuery): Promise<Buffer> {
    const f = await this.filters(actor, q);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tổng hợp ĐRL');
    if (q.by === 'faculty') {
      ws.columns = [
        { header: 'Khoa', key: 'faculty', width: 38 }, { header: 'Số sinh viên được cộng điểm', key: 'studentCount', width: 28 },
        { header: 'Số sự kiện', key: 'eventCount', width: 14 }, { header: 'Tổng ĐRL', key: 'totalDrl', width: 14 },
      ];
      for (const r of await this.byFaculty(f, q)) ws.addRow({ ...r, faculty: safeCell(r.faculty) });
    } else {
      ws.columns = [
        { header: 'MSSV', key: 'mssv', width: 16 }, { header: 'Họ tên', key: 'fullName', width: 32 },
        { header: 'Khoa', key: 'faculty', width: 32 }, { header: 'Số sự kiện', key: 'eventCount', width: 14 },
        { header: 'Tổng ĐRL', key: 'totalDrl', width: 14 },
      ];
      const rows = await this.byStudent(f, EXPORT_MAX_ROWS, 0);
      for (const r of rows) ws.addRow({ ...r, mssv: safeCell(r.mssv), fullName: safeCell(r.fullName), faculty: safeCell(r.faculty) });
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    // [BM] xuat du lieu ca nhan hang loat deu ghi nhat ky
    await this.audit.log(actor, 'REPORT_EXPORT', 'report', null, { after: { by: q.by, from: q.from, to: q.to, eventId: q.eventId, facultyUnitId: q.facultyUnitId } });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------- noi bo ----------

  // [BM] pham vi: su kien nguoi dung duoc thay + chi sinh vien thuoc khoa trong pham vi cua ho
  private async filters(actor: CurrentUser, q: DrlReportQuery) {
    const visibleEvents = await this.events.visibleEventIds(actor);
    const visibleUnits = await this.scope.visibleUnitIds(actor);
    if (q.facultyUnitId && visibleUnits && !visibleUnits.includes(q.facultyUnitId)) throw Err.notFound('khoa');

    const where = ["a.drl_awarded > 0", 'a.voided_at IS NULL'];
    const baseArgs: unknown[] = [];
    if (q.from) { where.push('e.start_at >= ?'); baseArgs.push(new Date(`${q.from}T00:00:00+07:00`)); }
    if (q.to) { where.push('e.start_at < ?'); baseArgs.push(new Date(new Date(`${q.to}T00:00:00+07:00`).getTime() + 24 * 3600_000)); }
    if (q.eventId) { where.push('a.event_id = ?'); baseArgs.push(q.eventId); }
    if (visibleEvents) {
      where.push(`a.event_id IN (${visibleEvents.map(() => '?').join(',') || "''"})`);
      baseArgs.push(...visibleEvents);
    }
    const base = `SELECT COALESCE(s.merged_into, a.mssv) AS canon, a.event_id AS eventId, a.drl_awarded AS drl
        FROM attendances a JOIN events e ON e.id = a.event_id AND e.status = 'FINALIZED'
        LEFT JOIN students s ON s.mssv = a.mssv WHERE ${where.join(' AND ')}`;

    const sw: string[] = [];
    const studentArgs: unknown[] = [];
    if (visibleUnits) { sw.push(`t.faculty_unit_id IN (${visibleUnits.map(() => '?').join(',') || "''"})`); studentArgs.push(...visibleUnits); }
    if (q.facultyUnitId) { sw.push('t.faculty_unit_id = ?'); studentArgs.push(q.facultyUnitId); }
    return { base, baseArgs, studentWhere: sw.length ? `WHERE ${sw.join(' AND ')}` : '', studentArgs, visibleUnits };
  }

  private async byStudent(f: Awaited<ReturnType<ReportsService['filters']>>, limit: number, offset: number): Promise<DrlStudentRow[]> {
    const rows = await this.ds.query(
      `SELECT t.mssv, t.full_name_latest AS fullName, u.name AS faculty, COUNT(DISTINCT b.eventId) AS eventCount, SUM(b.drl) AS totalDrl
         FROM (${f.base}) b JOIN students t ON t.mssv = b.canon JOIN units u ON u.id = t.faculty_unit_id ${f.studentWhere}
        GROUP BY t.mssv, t.full_name_latest, u.name ORDER BY totalDrl DESC, t.mssv LIMIT ? OFFSET ?`,
      [...f.baseArgs, ...f.studentArgs, limit, offset],
    );
    return rows.map((r: any) => ({ ...r, eventCount: Number(r.eventCount), totalDrl: Number(r.totalDrl) }));
  }

  // [NV] chot-giao-dien.md muc 1: luon du cac khoa dang hoat dong (ke ca khoa 0 diem)
  private async byFaculty(f: Awaited<ReturnType<ReportsService['filters']>>, q: DrlReportQuery): Promise<DrlFacultyRow[]> {
    const where = ["u.type = 'FACULTY'", 'u.is_active = 1'];
    const args: unknown[] = [];
    if (f.visibleUnits) { where.push(`u.id IN (${f.visibleUnits.map(() => '?').join(',') || "''"})`); args.push(...f.visibleUnits); }
    if (q.facultyUnitId) { where.push('u.id = ?'); args.push(q.facultyUnitId); }
    const rows = await this.ds.query(
      `SELECT u.id AS facultyId, u.name AS faculty,
              COUNT(DISTINCT CASE WHEN b.canon IS NOT NULL THEN t.mssv END) AS studentCount,
              COUNT(DISTINCT b.eventId) AS eventCount, COALESCE(SUM(b.drl), 0) AS totalDrl
         FROM units u LEFT JOIN students t ON t.faculty_unit_id = u.id AND t.merged_into IS NULL
         LEFT JOIN (${f.base}) b ON b.canon = t.mssv
        WHERE ${where.join(' AND ')} GROUP BY u.id, u.name ORDER BY u.name`,
      [...f.baseArgs, ...args],
    );
    return rows.map((r: any) => ({
      facultyId: r.facultyId, faculty: r.faculty, studentCount: Number(r.studentCount), eventCount: Number(r.eventCount), totalDrl: Number(r.totalDrl),
    }));
  }
}
