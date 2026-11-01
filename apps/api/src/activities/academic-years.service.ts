// Quan ly nam hoc - dac ta quan-ly-hoat-dong 2. Khoa so: du lieu cua nam hoc chi doc, mo lai can ly do (ghi nhat ky).
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Err, isDuplicateError } from '../common/errors';
import { CreateYearDto, UpdateYearDto } from './dto/admin.dto';
import { AcademicYear } from './entities/academic-year.entity';

export interface YearDto {
  id: string; name: string; startDate: string; endDate: string;
  planDeadline: string | null; reportDeadline: string | null; locked: boolean; lockedAt: Date | null;
}

export const toYearDto = (y: AcademicYear): YearDto => ({
  id: y.id, name: y.name, startDate: y.startDate, endDate: y.endDate,
  planDeadline: y.planDeadline, reportDeadline: y.reportDeadline, locked: y.lockedAt !== null, lockedAt: y.lockedAt,
});

const view = (y: AcademicYear) => ({ name: y.name, startDate: y.startDate, endDate: y.endDate, planDeadline: y.planDeadline, reportDeadline: y.reportDeadline, locked: y.lockedAt !== null });

@Injectable()
export class AcademicYearsService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly audit: AuditService) {}

  async list(): Promise<YearDto[]> {
    const rows = await this.ds.getRepository(AcademicYear).find({ order: { startDate: 'DESC' } });
    return rows.map(toYearDto);
  }

  async create(actor: CurrentUser, dto: CreateYearDto): Promise<YearDto> {
    this.assertRange(dto.startDate, dto.endDate, dto.planDeadline, dto.reportDeadline);
    const repo = this.ds.getRepository(AcademicYear);
    await this.assertNoOverlap(dto.startDate, dto.endDate, null);
    try {
      const y = await repo.save(repo.create({
        id: randomUUID(), name: dto.name, startDate: dto.startDate, endDate: dto.endDate,
        planDeadline: dto.planDeadline ?? null, reportDeadline: dto.reportDeadline ?? null, lockedAt: null,
      }));
      await this.audit.log(actor, 'YEAR_CREATE', 'academic_year', y.id, { after: view(y) });
      return toYearDto(y);
    } catch (e) {
      if (isDuplicateError(e)) throw Err.conflict('YEAR_EXISTS', 'Tên năm học đã tồn tại.');
      throw e;
    }
  }

  async update(actor: CurrentUser, id: string, dto: UpdateYearDto): Promise<YearDto> {
    const repo = this.ds.getRepository(AcademicYear);
    const y = await this.find(id);
    if (y.lockedAt) throw Err.conflict('YEAR_LOCKED', 'Năm học đã khóa sổ, mở lại trước khi sửa.');
    const before = view(y);
    if (dto.name !== undefined) y.name = dto.name;
    if (dto.startDate !== undefined) y.startDate = dto.startDate;
    if (dto.endDate !== undefined) y.endDate = dto.endDate;
    if (dto.planDeadline !== undefined) y.planDeadline = dto.planDeadline;
    if (dto.reportDeadline !== undefined) y.reportDeadline = dto.reportDeadline;
    this.assertRange(y.startDate, y.endDate, y.planDeadline ?? undefined, y.reportDeadline ?? undefined);
    await this.assertNoOverlap(y.startDate, y.endDate, y.id);
    try {
      await repo.save(y);
    } catch (e) {
      if (isDuplicateError(e)) throw Err.conflict('YEAR_EXISTS', 'Tên năm học đã tồn tại.');
      throw e;
    }
    await this.audit.log(actor, 'YEAR_UPDATE', 'academic_year', id, { before, after: view(y) });
    return toYearDto(y);
  }

  // [NV] 2: khoa so sau tong ket; mo lai can ly do
  async setLocked(actor: CurrentUser, id: string, locked: boolean, reason: string): Promise<YearDto> {
    const repo = this.ds.getRepository(AcademicYear);
    const y = await this.find(id);
    if (locked === (y.lockedAt !== null)) throw Err.conflict('INVALID_STATE', locked ? 'Năm học đã khóa sổ.' : 'Năm học đang mở.');
    const before = view(y);
    y.lockedAt = locked ? new Date() : null;
    await repo.save(y);
    await this.audit.log(actor, locked ? 'YEAR_LOCK' : 'YEAR_UNLOCK', 'academic_year', id, { before, after: view(y), reason });
    return toYearDto(y);
  }

  private async find(id: string): Promise<AcademicYear> {
    const y = await this.ds.getRepository(AcademicYear).findOne({ where: { id } });
    if (!y) throw Err.notFound('năm học');
    return y;
  }

  private assertRange(start: string, end: string, plan?: string | null, report?: string | null): void {
    const real = (d: string) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
    for (const d of [start, end, plan, report]) if (d && !real(d)) throw Err.bad('INVALID_DATE', `Ngày không tồn tại: ${d}`);
    if (!(start < end)) throw Err.bad('INVALID_YEAR_RANGE', 'Ngày kết thúc phải sau ngày bắt đầu.');
    for (const d of [plan, report]) {
      if (d && (d < start || d > end)) throw Err.bad('INVALID_DEADLINE', 'Hạn nộp phải nằm trong năm học.');
    }
  }

  // hai nam hoc khong duoc chong len nhau (de moi hoat dong thuoc dung mot nam)
  private async assertNoOverlap(start: string, end: string, selfId: string | null): Promise<void> {
    const hit = await this.ds.getRepository(AcademicYear).createQueryBuilder('y')
      .where('y.startDate <= :end AND y.endDate >= :start', { start, end })
      .andWhere(selfId ? 'y.id <> :selfId' : '1=1', { selfId })
      .getOne();
    if (hit) throw Err.conflict('YEAR_OVERLAP', `Khoảng thời gian bị chồng với năm học ${hit.name}.`);
  }
}
