// Quan ly khoa / don vi - dac ta 3.7 (bang Khoa)
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Page, PaginationQuery } from '../common/dto/pagination.dto';
import { Err, isDuplicateError, isForeignKeyError } from '../common/errors';
import { UnitScopeService } from '../common/unit-scope.service';
import { AdminUser } from '../users/entities/admin-user.entity';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { Unit } from './entities/unit.entity';

const view = (u: Unit) => ({ name: u.name, code: u.code, type: u.type, parentId: u.parentId, isActive: u.isActive });

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit) private readonly units: Repository<Unit>,
    @InjectRepository(AdminUser) private readonly users: Repository<AdminUser>,
    private readonly scope: UnitScopeService,
    private readonly audit: AuditService,
  ) {}

  // [BM] QTV truong thay tat ca; quan ly khoa chi thay don vi cua minh va cap duoi
  async list(actor: CurrentUser, q: PaginationQuery): Promise<Page<Unit>> {
    const ids = await this.scope.visibleUnitIds(actor);
    const [items, total] = await this.units.findAndCount({
      where: ids ? { id: In(ids) } : {},
      order: { type: 'DESC', name: 'ASC' }, // truong truoc, khoa sau
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    return { items, total, page: q.page, limit: q.limit };
  }

  async get(actor: CurrentUser, id: string): Promise<Unit> {
    await this.scope.assertCanAccessUnit(actor, id);
    return this.findOrFail(id);
  }

  async create(actor: CurrentUser, dto: CreateUnitDto): Promise<Unit> {
    // [NV] 2.1: don vi moi luon la khoa, thuoc Doan truong
    const school = await this.units.findOneByOrFail({ type: 'SCHOOL' });
    try {
      const unit = await this.units.save(
        this.units.create({ name: dto.name, code: dto.code, type: 'FACULTY', parentId: school.id, isActive: true }),
      );
      await this.audit.log(actor, 'UNIT_CREATE', 'unit', unit.id, { after: view(unit) });
      return unit;
    } catch (e) {
      if (isDuplicateError(e)) throw Err.conflict('UNIT_CODE_EXISTS', 'Mã đơn vị đã tồn tại.');
      throw e;
    }
  }

  async update(actor: CurrentUser, id: string, dto: UpdateUnitDto): Promise<Unit> {
    const unit = await this.findOrFail(id);
    const before = view(unit);
    if (dto.name !== undefined) unit.name = dto.name;
    if (dto.code !== undefined) unit.code = dto.code;
    try {
      await this.units.save(unit);
    } catch (e) {
      if (isDuplicateError(e)) throw Err.conflict('UNIT_CODE_EXISTS', 'Mã đơn vị đã tồn tại.');
      throw e;
    }
    await this.audit.log(actor, 'UNIT_UPDATE', 'unit', id, { before, after: view(unit) });
    return unit;
  }

  // "Ngung hoat dong": an khoi danh sach chon, giu nguyen du lieu cu
  async setActive(actor: CurrentUser, id: string, active: boolean, reason: string): Promise<Unit> {
    const unit = await this.findOrFail(id);
    // [NV] 3.7: khong ngung hoat dong Doan truong
    if (unit.type === 'SCHOOL' && !active) {
      throw Err.bad('SCHOOL_UNIT_PROTECTED', 'Không thể ngừng hoạt động đơn vị Đoàn trường.');
    }
    const before = view(unit);
    unit.isActive = active;
    await this.units.save(unit);
    await this.audit.log(actor, active ? 'UNIT_ACTIVATE' : 'UNIT_DEACTIVATE', 'unit', id, {
      before,
      after: view(unit),
      reason,
    });
    return unit;
  }

  // Xoa cung chi khi chua co TK, don vi con (va sau nay: su kien, sinh vien) - dac ta 3.7
  async remove(actor: CurrentUser, id: string, reason: string): Promise<void> {
    const unit = await this.findOrFail(id);
    if (unit.type === 'SCHOOL') throw Err.bad('SCHOOL_UNIT_PROTECTED', 'Không thể xóa đơn vị Đoàn trường.');

    const [userCount, childCount] = await Promise.all([
      this.users.count({ where: { unitId: id } }),
      this.units.count({ where: { parentId: id } }),
    ]);
    const inUse = () => Err.conflict('UNIT_IN_USE', 'Đơn vị đã có dữ liệu liên quan, hãy dùng "Ngừng hoạt động".');
    if (userCount > 0 || childCount > 0) throw inUse();

    try {
      await this.units.delete(id);
    } catch (e) {
      // bang khac (su kien, sinh vien...) tham chieu qua khoa ngoai
      if (isForeignKeyError(e)) throw inUse();
      throw e;
    }
    await this.audit.log(actor, 'UNIT_DELETE', 'unit', id, { before: view(unit), reason });
  }

  private async findOrFail(id: string): Promise<Unit> {
    const unit = await this.units.findOne({ where: { id } });
    if (!unit) throw Err.notFound('đơn vị');
    return unit;
  }
}
