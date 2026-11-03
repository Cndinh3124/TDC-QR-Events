// Ho so sinh vien tu hinh thanh khi diem danh: xem, sua, gop MSSV trung - dac ta 3.7, 6 (students)
// Gop = danh dau merged_into (khong sua cac luot cu); bao cao va luat "mot lan DRL" tinh theo MSSV chinh.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Page } from '../common/dto/pagination.dto';
import { Err } from '../common/errors';
import { escapeLike } from '../common/sql';
import { UnitScopeService } from '../common/unit-scope.service';
import { EventsService } from '../events/events.service';
import { PublicLookupService } from '../public/public-lookup.service';
import { MergeStudentDto, StudentDto, StudentHistoryItem, StudentListQuery, UpdateStudentDto } from './students.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scope: UnitScopeService,
    private readonly events: EventsService,
    private readonly lookup: PublicLookupService,
    private readonly audit: AuditService,
  ) {}

  // [BM] quan ly khoa chi thay sinh vien thuoc khoa trong pham vi cua minh
  async list(actor: CurrentUser, q: StudentListQuery): Promise<Page<StudentDto>> {
    const ids = await this.scope.visibleUnitIds(actor);
    const where: string[] = ['s.merged_into IS NULL'];
    const args: unknown[] = [];
    if (ids) {
      where.push(`s.faculty_unit_id IN (${ids.map(() => '?').join(',') || "''"})`);
      args.push(...ids);
    }
    if (q.facultyUnitId) {
      where.push('s.faculty_unit_id = ?');
      args.push(q.facultyUnitId);
    }
    if (q.q) {
      where.push('(s.mssv LIKE ? OR s.full_name_latest LIKE ?)');
      args.push(`%${escapeLike(q.q)}%`, `%${escapeLike(q.q)}%`);
    }
    const cond = where.join(' AND ');
    const [{ n }] = await this.ds.query(`SELECT COUNT(*) AS n FROM students s WHERE ${cond}`, args);
    const rows = await this.ds.query(
      `SELECT s.mssv, s.full_name_latest AS fullName, s.first_seen_at AS firstSeenAt, s.merged_into AS mergedInto,
              u.id AS facultyId, u.name AS facultyName,
              (SELECT COUNT(*) FROM attendances a WHERE a.voided_at IS NULL AND (a.mssv = s.mssv
                 OR a.mssv IN (SELECT m.mssv FROM students m WHERE m.merged_into = s.mssv))) AS attendanceCount,
              (SELECT COALESCE(SUM(a.drl_awarded), 0) FROM attendances a WHERE a.voided_at IS NULL AND (a.mssv = s.mssv
                 OR a.mssv IN (SELECT m.mssv FROM students m WHERE m.merged_into = s.mssv))) AS totalDrl
         FROM students s JOIN units u ON u.id = s.faculty_unit_id
        WHERE ${cond} ORDER BY s.mssv LIMIT ? OFFSET ?`,
      [...args, q.limit, (q.page - 1) * q.limit],
    );
    return { items: rows.map((r: any) => this.toDto(r)), total: Number(n), page: q.page, limit: q.limit };
  }

  // chi tiet + lich su (chi cac su kien nguoi xem duoc thay)
  async get(actor: CurrentUser, mssv: string): Promise<{ student: StudentDto; history: StudentHistoryItem[] }> {
    const s = await this.findInScope(actor, mssv);
    const visible = await this.events.visibleEventIds(actor);
    const rows = await this.ds.query(
      `SELECT a.id AS attendanceId, e.id AS eventId, e.title AS eventTitle, e.start_at AS eventStartAt, a.checkin_at AS checkinAt,
              a.review_status AS reviewStatus, a.drl_awarded AS drlAwarded, a.voided_at IS NOT NULL AS voided
         FROM attendances a JOIN events e ON e.id = a.event_id
        WHERE (a.mssv = ? OR a.mssv IN (SELECT m.mssv FROM students m WHERE m.merged_into = ?))
          ${visible ? `AND e.id IN (${visible.map(() => '?').join(',') || "''"})` : ''}
        ORDER BY a.checkin_at DESC LIMIT 200`,
      [mssv, mssv, ...(visible ?? [])],
    );
    // MySQL tra 0 / 1 (co the dang chuoi): doi sang boolean truoc khi loc
    const history: StudentHistoryItem[] = rows.map((r: any) => ({ ...r, voided: Boolean(Number(r.voided)) }));
    const active = history.filter((h) => !h.voided);
    const total = active.reduce((t, h) => t + Number(h.drlAwarded ?? 0), 0);
    return { student: this.toDto({ ...s, attendanceCount: active.length, totalDrl: total }), history };
  }

  async update(actor: CurrentUser, mssv: string, dto: UpdateStudentDto): Promise<StudentDto> {
    if (dto.fullName === undefined && dto.facultyUnitId === undefined) throw Err.bad('NO_CHANGES', 'Không có thông tin nào thay đổi.');
    const s = await this.findInScope(actor, mssv);
    if (dto.facultyUnitId !== undefined) {
      await this.scope.assertCanAccessUnit(actor, dto.facultyUnitId); // [BM] khong chuyen sinh vien sang khoa ngoai pham vi
      await this.lookup.assertFaculty(dto.facultyUnitId);
    }
    const before = { fullName: s.fullName, facultyUnitId: s.facultyId };
    const fullName = dto.fullName ?? s.fullName;
    const facultyUnitId = dto.facultyUnitId ?? s.facultyId;
    // [NV] 3.7: quan tri da sua thi khoa ho so, lan diem danh sau khong ghi de ten / khoa
    await this.ds.query(
      'UPDATE students SET full_name_latest = ?, faculty_unit_id = ?, `profile_locked` = 1 WHERE mssv = ?',
      [fullName, facultyUnitId, mssv],
    );
    await this.audit.log(actor, 'STUDENT_UPDATE', 'student', mssv, { before, after: { fullName, facultyUnitId }, reason: dto.reason });
    return (await this.get(actor, mssv)).student;
  }

  // [NV] 3.7: gop hai MSSV cua cung mot nguoi (go nham). Chi Doan truong, vi anh huong ca nhieu khoa va bao cao DRL.
  async merge(actor: CurrentUser, mssv: string, dto: MergeStudentDto): Promise<StudentDto> {
    if (actor.role !== 'SCHOOL_ADMIN') throw Err.forbidden();
    if (dto.intoMssv === mssv) throw Err.bad('INVALID_MERGE', 'Không thể gộp một MSSV vào chính nó.');
    await this.lookup.validMssv(dto.intoMssv);
    await this.ds.transaction(async (m) => {
      const rows = await m.query('SELECT mssv, merged_into AS mergedInto FROM students WHERE mssv IN (?, ?) FOR UPDATE', [mssv, dto.intoMssv]);
      const src = rows.find((r: any) => r.mssv === mssv);
      const dst = rows.find((r: any) => r.mssv === dto.intoMssv);
      if (!src || !dst) throw Err.notFound('sinh viên');
      if (src.mergedInto) throw Err.conflict('ALREADY_MERGED', 'MSSV này đã được gộp vào MSSV khác.');
      if (dst.mergedInto) throw Err.conflict('TARGET_MERGED', 'MSSV đích đã bị gộp vào MSSV khác, hãy chọn MSSV chính.');
      const [{ n: hasChildren }] = await m.query('SELECT COUNT(*) AS n FROM students WHERE merged_into = ?', [mssv]);
      if (Number(hasChildren) > 0) throw Err.conflict('HAS_MERGED', 'Có MSSV khác đã được gộp vào MSSV này, hãy gộp thẳng vào MSSV chính.');
      // da chot DRL cho ca hai trong cung mot su kien thi gop se cong don hai lan: chan, de mo khoa va xu ly truoc
      const clash = await m.query(
        `SELECT a1.event_id FROM attendances a1 JOIN attendances a2 ON a2.event_id = a1.event_id AND a2.mssv = ?
           JOIN events e ON e.id = a1.event_id AND e.status = 'FINALIZED'
          WHERE a1.mssv = ? AND a1.drl_awarded > 0 AND a2.drl_awarded > 0 LIMIT 1`,
        [dto.intoMssv, mssv],
      );
      if (clash.length > 0) {
        throw Err.conflict('MERGE_CONFLICT', 'Hai MSSV cùng được cộng điểm trong một sự kiện đã chốt. Hãy mở khóa và xử lý trước khi gộp.');
      }
      await m.query('UPDATE students SET merged_into = ? WHERE mssv = ?', [dto.intoMssv, mssv]);
    });
    await this.audit.log(actor, 'STUDENT_MERGE', 'student', mssv, { after: { intoMssv: dto.intoMssv }, reason: dto.reason });
    return (await this.get(actor, dto.intoMssv)).student;
  }

  // [BM] ngoai pham vi hoac khong ton tai deu 404
  private async findInScope(actor: CurrentUser, mssv: string): Promise<any> {
    const [s] = await this.ds.query(
      `SELECT s.mssv, s.full_name_latest AS fullName, s.first_seen_at AS firstSeenAt, s.merged_into AS mergedInto,
              u.id AS facultyId, u.name AS facultyName
         FROM students s JOIN units u ON u.id = s.faculty_unit_id WHERE s.mssv = ?`,
      [mssv],
    );
    if (!s || !(await this.scope.canAccessUnit(actor, s.facultyId))) throw Err.notFound('sinh viên');
    return s;
  }

  private toDto(r: any): StudentDto {
    return {
      mssv: r.mssv, fullName: r.fullName, faculty: { id: r.facultyId, name: r.facultyName },
      firstSeenAt: r.firstSeenAt, mergedInto: r.mergedInto, attendanceCount: Number(r.attendanceCount ?? 0), totalDrl: Number(r.totalDrl ?? 0),
    };
  }
}
