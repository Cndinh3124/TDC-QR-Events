// Thong bao trong ung dung - dac ta quan-ly-hoat-dong 4.3. Moi nguoi chi doc / danh dau thong bao cua minh.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { CurrentUser } from '../common/current-user';
import { Page } from '../common/dto/pagination.dto';
import { Err } from '../common/errors';
import { AdminUser } from '../users/entities/admin-user.entity';
import { NotificationQuery } from './dto/admin.dto';
import { Notification } from './entities/activity-parts.entity';

export interface NotificationDto {
  id: string; type: string; message: string; entityType: string | null; entityId: string | null; read: boolean; createdAt: Date;
}

const toDto = (n: Notification): NotificationDto => ({
  id: n.id, type: n.type, message: n.message, entityType: n.entityType, entityId: n.entityId, read: n.readAt !== null, createdAt: n.createdAt,
});

@Injectable()
export class NotificationsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // gui trong cung giao dich voi thao tac goc; bo qua chinh nguoi thuc hien
  async send(m: EntityManager, userIds: string[], exceptId: string, type: string, message: string, entityType: string, entityId: string): Promise<void> {
    const now = new Date();
    const rows = [...new Set(userIds)].filter((id) => id !== exceptId).map((userId) =>
      m.create(Notification, { id: randomUUID(), userId, type, message: message.slice(0, 300), entityType, entityId, readAt: null, createdAt: now }));
    if (rows.length) await m.save(rows);
  }

  // quan ly dang hoat dong cua mot don vi
  async unitManagers(m: EntityManager, unitId: string): Promise<string[]> {
    const rows = await m.find(AdminUser, { where: { unitId, isActive: true }, select: ['id'] });
    return rows.map((r) => r.id);
  }

  async admins(m: EntityManager): Promise<string[]> {
    const rows = await m.find(AdminUser, { where: { role: 'SCHOOL_ADMIN', isActive: true }, select: ['id'] });
    return rows.map((r) => r.id);
  }

  async list(actor: CurrentUser, q: NotificationQuery): Promise<Page<NotificationDto> & { unread: number }> {
    const repo = this.ds.getRepository(Notification);
    const where = { userId: actor.id, ...(q.unread ? { readAt: IsNull() } : {}) };
    const [rows, total] = await repo.findAndCount({ where, order: { createdAt: 'DESC', id: 'ASC' }, skip: (q.page - 1) * q.limit, take: q.limit });
    const unread = await repo.count({ where: { userId: actor.id, readAt: IsNull() } });
    return { items: rows.map(toDto), total, page: q.page, limit: q.limit, unread };
  }

  async unreadCount(actor: CurrentUser): Promise<{ unread: number }> {
    return { unread: await this.ds.getRepository(Notification).count({ where: { userId: actor.id, readAt: IsNull() } }) };
  }

  // [BM] chi dong cua chinh minh: tim theo (id, userId) nen thong bao nguoi khac tra 404
  async markRead(actor: CurrentUser, id: string): Promise<void> {
    const r = await this.ds.getRepository(Notification).update({ id, userId: actor.id, readAt: IsNull() }, { readAt: new Date() });
    if (!r.affected) {
      const exists = await this.ds.getRepository(Notification).exists({ where: { id, userId: actor.id } });
      if (!exists) throw Err.notFound('thông báo');
    }
  }

  async markAllRead(actor: CurrentUser): Promise<void> {
    await this.ds.getRepository(Notification).update({ userId: actor.id, readAt: IsNull() }, { readAt: new Date() });
  }
}
