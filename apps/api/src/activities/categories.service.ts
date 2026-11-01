// Linh vuc hoat dong - dac ta quan-ly-hoat-dong 3.1 (do Doan truong quan ly)
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Err, isDuplicateError } from '../common/errors';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/admin.dto';
import { ActivityCategory } from './entities/activity-category.entity';

const toDto = (c: ActivityCategory) => ({ id: c.id, name: c.name, position: c.position, isActive: c.isActive });

@Injectable()
export class CategoriesService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly audit: AuditService) {}

  // nguoi khong phai Doan truong chi thay linh vuc dang dung
  async list(includeInactive: boolean) {
    const rows = await this.ds.getRepository(ActivityCategory).find({
      where: includeInactive ? {} : { isActive: true }, order: { position: 'ASC', name: 'ASC' },
    });
    return rows.map(toDto);
  }

  async create(actor: CurrentUser, dto: CreateCategoryDto) {
    const repo = this.ds.getRepository(ActivityCategory);
    const max = await repo.createQueryBuilder('c').select('COALESCE(MAX(c.position), 0)', 'm').getRawOne<{ m: string }>();
    try {
      const c = await repo.save(repo.create({ id: randomUUID(), name: dto.name, position: dto.position ?? Number(max?.m ?? 0) + 1, isActive: true }));
      await this.audit.log(actor, 'CATEGORY_CREATE', 'activity_category', c.id, { after: toDto(c) });
      return toDto(c);
    } catch (e) {
      if (isDuplicateError(e)) throw Err.conflict('CATEGORY_EXISTS', 'Lĩnh vực này đã tồn tại.');
      throw e;
    }
  }

  async update(actor: CurrentUser, id: string, dto: UpdateCategoryDto) {
    const repo = this.ds.getRepository(ActivityCategory);
    const c = await repo.findOne({ where: { id } });
    if (!c) throw Err.notFound('lĩnh vực');
    const before = toDto(c);
    if (dto.name !== undefined) c.name = dto.name;
    if (dto.position !== undefined) c.position = dto.position;
    if (dto.isActive !== undefined) c.isActive = dto.isActive;
    try {
      await repo.save(c);
    } catch (e) {
      if (isDuplicateError(e)) throw Err.conflict('CATEGORY_EXISTS', 'Lĩnh vực này đã tồn tại.');
      throw e;
    }
    await this.audit.log(actor, 'CATEGORY_UPDATE', 'activity_category', id, { before, after: toDto(c) });
    return toDto(c);
  }
}
