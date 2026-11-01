// Thong ke va xuat Excel hoat dong - dac ta quan-ly-hoat-dong 10 (B10). [BM] chi tinh hoat dong thuoc pham vi quan ly cua nguoi goi.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Err } from '../common/errors';
import { UnitScopeService } from '../common/unit-scope.service';
import { safeCell } from '../reports/reports.service';
import { STATUS_LABEL } from './activity-rules';
import { ActivityStatsQuery } from './dto/admin.dto';
import { AcademicYear } from './entities/academic-year.entity';

interface Row {
  id: string; code: string; name: string; unitId: string; categoryId: string | null; status: keyof typeof STATUS_LABEL;
  evaluation: string | null; reward: string | null; startAt: Date; endAt: Date; location: string | null; expected: number | null;
  planUrl: string | null; bp: string | null; ba: string | null; participants: number | null; media: number; pub: number; result: number;
}

const VN = 7 * 3600_000;
const month = (d: Date) => new Date(d.getTime() + VN).toISOString().slice(0, 7);
const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 10);

@Injectable()
export class ActivityStatsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scope: UnitScopeService,
    private readonly audit: AuditService,
  ) {}

  // nam hoc duoc chon, khong chon thi nam dang chay (hom nay nam trong khoang) hoac nam moi nhat
  private async year(id?: string): Promise<AcademicYear> {
    const repo = this.ds.getRepository(AcademicYear);
    if (id) {
      const y = await repo.findOne({ where: { id } });
      if (!y) throw Err.notFound('năm học');
      return y;
    }
    const today = new Date().toISOString().slice(0, 10);
    const [cur] = await this.ds.query('SELECT id FROM academic_years WHERE start_date <= ? AND end_date >= ? ORDER BY start_date DESC LIMIT 1', [today, today]);
    const y = cur ? await repo.findOne({ where: { id: cur.id } }) : (await repo.find({ order: { startDate: 'DESC' }, take: 1 }))[0];
    if (!y) throw Err.notFound('năm học');
    return y;
  }

  private async rows(actor: CurrentUser, yearId: string, unitId?: string): Promise<Row[]> {
    const visible = await this.scope.visibleUnitIds(actor);
    let units: string[] | null = visible;
    if (unitId) {
      await this.scope.assertCanAccessUnit(actor, unitId);
      const tree = await this.tree(unitId);
      units = visible ? tree.filter((u) => visible.includes(u)) : tree;
    }
    if (units && units.length === 0) return [];
    const where = units ? 'AND a.unit_id IN (?)' : '';
    const res = await this.ds.query(
      `SELECT a.id, a.code, a.name, a.unit_id AS unitId, a.category_id AS categoryId, a.status, a.evaluation, a.reward,
              a.start_at AS startAt, a.end_at AS endAt, a.location, a.expected_count AS expected, a.plan_url AS planUrl,
              a.budget_planned AS bp, a.budget_actual AS ba,
              CASE WHEN EXISTS (SELECT 1 FROM activity_events ae WHERE ae.activity_id = a.id)
                   THEN (SELECT COUNT(DISTINCT t.mssv) FROM activity_events ae JOIN attendances t ON t.event_id = ae.event_id AND t.voided_at IS NULL WHERE ae.activity_id = a.id)
                   ELSE a.manual_count END AS participants,
              (SELECT COUNT(*) FROM activity_links l WHERE l.activity_id = a.id AND l.\`group\` = 'MEDIA') AS media,
              (SELECT COUNT(*) FROM activity_links l WHERE l.activity_id = a.id AND l.\`group\` = 'PUBLICATION') AS pub,
              (SELECT COUNT(*) FROM activity_links l WHERE l.activity_id = a.id AND l.\`group\` = 'RESULT') AS result
       FROM activities a WHERE a.academic_year_id = ? ${where} ORDER BY a.start_at, a.id`,
      units ? [yearId, units] : [yearId],
    );
    return res.map((r: Record<string, unknown>) => ({
      ...r, startAt: new Date(r.startAt as string | Date), endAt: new Date(r.endAt as string | Date),
      participants: r.participants === null ? null : Number(r.participants), media: Number(r.media), pub: Number(r.pub), result: Number(r.result),
    })) as Row[];
  }

  private async tree(unitId: string): Promise<string[]> {
    const out = [unitId];
    let frontier = [unitId];
    for (let d = 0; d < 5 && frontier.length; d++) {
      const kids: Array<{ id: string }> = await this.ds.query('SELECT id FROM units WHERE parent_id IN (?)', [frontier]);
      frontier = kids.map((k) => k.id).filter((k) => !out.includes(k));
      out.push(...frontier);
    }
    return out;
  }

  private async names(table: 'units' | 'activity_categories'): Promise<Map<string, string>> {
    const rs: Array<{ id: string; name: string }> = await this.ds.query(`SELECT id, name FROM ${table}`);
    return new Map(rs.map((r) => [r.id, r.name]));
  }

  async stats(actor: CurrentUser, q: ActivityStatsQuery) {
    const year = await this.year(q.academicYearId);
    const rows = await this.rows(actor, year.id, q.unitId);
    const unitName = await this.names('units');
    const catName = await this.names('activity_categories');

    const evaluated = rows.filter((r) => r.evaluation !== null);
    const completed = evaluated.filter((r) => r.evaluation === 'COMPLETED').length;
    const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
    const byStatus = Object.fromEntries(Object.keys(STATUS_LABEL).map((s) => [s, rows.filter((r) => r.status === s).length]));

    const group = <K extends string>(key: (r: Row) => K, label: (k: K) => string) => {
      const m = new Map<K, Row[]>();
      for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
      return [...m.entries()].map(([k, rs]) => ({
        key: k, label: label(k), total: rs.length,
        completed: rs.filter((r) => r.evaluation === 'COMPLETED').length,
        notCompleted: rs.filter((r) => r.evaluation === 'NOT_COMPLETED').length,
        withMedia: rs.filter((r) => r.media > 0).length,
        participants: rs.reduce((s, r) => s + (r.participants ?? 0), 0),
      }));
    };

    return {
      year: { id: year.id, name: year.name },
      kpi: {
        total: rows.length,
        evaluated: evaluated.length,
        completed,
        notCompleted: evaluated.length - completed,
        completionRate: pct(completed, evaluated.length), // chi tinh hoat dong da duoc danh gia
        rewarded: rows.filter((r) => r.reward === 'APPROVED').length,
        participants: sum((r) => r.participants ?? 0),
        withMedia: rows.filter((r) => r.media > 0).length,
        missingMedia: rows.filter((r) => r.media === 0).length,
        mediaLinks: sum((r) => r.media),
        publicationLinks: sum((r) => r.pub),
        budgetPlanned: sum((r) => Number(r.bp ?? 0)),
        budgetActual: sum((r) => Number(r.ba ?? 0)),
      },
      byStatus,
      byUnit: group((r) => r.unitId, (k) => unitName.get(k) ?? '—').sort((a, b) => b.total - a.total),
      byCategory: group((r) => r.categoryId ?? '', (k) => (k ? catName.get(k) ?? '—' : 'Chưa phân loại')).sort((a, b) => b.total - a.total),
      byMonth: group((r) => month(r.startAt), (k) => k).sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  // [BM] ten tep co dinh; o chuoi di qua safeCell (chan formula injection); ghi nhat ky xuat du lieu
  async exportXlsx(actor: CurrentUser, q: ActivityStatsQuery): Promise<Buffer> {
    const year = await this.year(q.academicYearId);
    const rows = await this.rows(actor, year.id, q.unitId);
    const unitName = await this.names('units');
    const catName = await this.names('activity_categories');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoạt động');
    ws.columns = [
      { header: 'Mã', key: 'code', width: 12 }, { header: 'Tên hoạt động', key: 'name', width: 44 }, { header: 'Đơn vị', key: 'unit', width: 28 },
      { header: 'Lĩnh vực', key: 'cat', width: 22 }, { header: 'Bắt đầu', key: 'start', width: 18 }, { header: 'Kết thúc', key: 'end', width: 18 },
      { header: 'Địa điểm', key: 'loc', width: 26 }, { header: 'Dự kiến', key: 'exp', width: 10 }, { header: 'Thực tế', key: 'act', width: 10 },
      { header: 'Kinh phí dự kiến', key: 'bp', width: 16 }, { header: 'Kinh phí thực tế', key: 'ba', width: 16 },
      { header: 'Trạng thái', key: 'st', width: 20 }, { header: 'Đánh giá', key: 'ev', width: 16 }, { header: 'Khen thưởng', key: 'rw', width: 16 },
      { header: 'Sản phẩm truyền thông', key: 'media', width: 14 }, { header: 'Link kế hoạch', key: 'plan', width: 40 },
    ];
    const when = (d: Date) => new Date(d.getTime() + VN).toISOString().replace('T', ' ').slice(0, 16);
    for (const r of rows) {
      ws.addRow({
        code: safeCell(r.code), name: safeCell(r.name), unit: safeCell(unitName.get(r.unitId) ?? ''), cat: safeCell(r.categoryId ? catName.get(r.categoryId) ?? '' : ''),
        start: when(r.startAt), end: when(r.endAt), loc: safeCell(r.location ?? ''), exp: r.expected, act: r.participants,
        bp: r.bp === null ? null : Number(r.bp), ba: r.ba === null ? null : Number(r.ba), st: STATUS_LABEL[r.status],
        ev: r.evaluation === 'COMPLETED' ? 'Hoàn thành' : r.evaluation === 'NOT_COMPLETED' ? 'Chưa hoàn thành' : '',
        rw: r.reward === 'APPROVED' ? 'Được khen thưởng' : r.reward === 'REJECTED' ? 'Không khen thưởng' : '', media: r.media, plan: safeCell(r.planUrl ?? ''),
      });
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.getColumn('bp').numFmt = '#,##0';
    ws.getColumn('ba').numFmt = '#,##0';

    const s = await this.stats(actor, { academicYearId: year.id, unitId: q.unitId });
    const sum = wb.addWorksheet('Tổng hợp theo đơn vị');
    sum.columns = [
      { header: 'Đơn vị', key: 'label', width: 34 }, { header: 'Số hoạt động', key: 'total', width: 14 }, { header: 'Hoàn thành', key: 'completed', width: 14 },
      { header: 'Chưa hoàn thành', key: 'notCompleted', width: 16 }, { header: 'Có truyền thông', key: 'withMedia', width: 16 }, { header: 'Lượt tham gia', key: 'participants', width: 14 },
    ];
    for (const u of s.byUnit) sum.addRow({ ...u, label: safeCell(u.label) });
    sum.getRow(1).font = { bold: true };

    await this.audit.log(actor, 'ACTIVITY_EXPORT', 'activity', null, { after: { academicYearId: year.id, unitId: q.unitId ?? null, rows: rows.length } });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
