// Xem nhat ky he thong - chi doc, chi QTV truong - dac ta 8.6
import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Roles } from '../common/decorators';
import { Page } from '../common/dto/pagination.dto';
import { AuditQuery } from './dto/audit-query.dto';
import { AuditLog } from './entities/audit-log.entity';

@Controller('admin/audit-logs')
@Roles('SCHOOL_ADMIN')
export class AuditController {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  @Get()
  async list(@Query() q: AuditQuery): Promise<Page<AuditLog>> {
    const where: FindOptionsWhere<AuditLog> = {};
    if (q.actorId) where.actorId = q.actorId;
    if (q.entity) where.entity = q.entity;
    if (q.entityId) where.entityId = q.entityId;
    if (q.action) where.action = q.action;
    if (q.from && q.to) where.createdAt = Between(q.from, q.to);
    else if (q.from) where.createdAt = MoreThanOrEqual(q.from);
    else if (q.to) where.createdAt = LessThanOrEqual(q.to);

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    return { items, total, page: q.page, limit: q.limit };
  }
}
