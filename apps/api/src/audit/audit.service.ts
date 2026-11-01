// Ghi nhat ky thao tac - dac ta 8.6. Chi them, khong sua/xoa.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditActor {
  id: string | null;
  ip?: string | null;
}

export interface AuditDetail {
  before?: unknown;
  after?: unknown;
  reason?: string;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  // [BM] noi goi phai tu chon cac truong an toan cho before/after (khong dua hash mat khau, token)
  async log(
    actor: AuditActor,
    action: string,
    entity: string,
    entityId: string | null,
    detail: AuditDetail = {},
  ): Promise<void> {
    await this.repo.insert({
      actorId: actor.id,
      action,
      entity,
      entityId,
      // cot JSON cho phep null; ep kieu vi QueryDeepPartial khong nhan null
      beforeJson: (detail.before ?? null) as any,
      afterJson: (detail.after ?? null) as any,
      reason: detail.reason ? detail.reason.slice(0, 500) : null,
      ip: actor.ip ? actor.ip.slice(0, 64) : null,
    });
  }
}
