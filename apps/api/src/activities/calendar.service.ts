// Lich thang: hoat dong + buoi diem danh trong mot khoang ngay - dac ta chuc-nang-giao-dien A13
// [BM] cung luat nhin thay nhu danh sach: hoat dong cua don vi minh (va cap duoi) hoac minh la don vi phoi hop;
// su kien trong pham vi hoac su kien cap truong duoc chia se.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, In } from 'typeorm';
import { CurrentUser } from '../common/current-user';
import { Err } from '../common/errors';
import { UnitScopeService } from '../common/unit-scope.service';
import { EventsService } from '../events/events.service';
import { Unit } from '../units/entities/unit.entity';
import { CalendarQuery } from './dto/admin.dto';
import { Activity, ActivityStatus } from './entities/activity.entity';

const MAX_DAYS = 62;
const MAX_ITEMS = 500; // moi loai; lich mot thang thuc te it hon nhieu
const DAY_MS = 24 * 3600_000;

export interface CalendarActivity {
  id: string;
  code: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: ActivityStatus;
  unit: { id: string; name: string } | null;
  // true = minh chi la don vi phoi hop (chi doc)
  coUnit: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  status: string;
  locationName: string | null;
  unit: { id: string; name: string } | null;
  canManage: boolean;
}

export interface CalendarResult {
  from: Date;
  to: Date;
  activities: CalendarActivity[];
  events: CalendarEvent[];
  truncated: boolean;
}

// ngay YYYY-MM-DD theo gio Viet Nam -> moc UTC
const vnDay = (d: string) => new Date(`${d}T00:00:00+07:00`);

@Injectable()
export class CalendarService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scope: UnitScopeService,
    private readonly events: EventsService,
  ) {}

  async calendar(actor: CurrentUser, q: CalendarQuery): Promise<CalendarResult> {
    const from = vnDay(q.from);
    const to = new Date(vnDay(q.to).getTime() + DAY_MS); // bao gom ca ngay "to"
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw Err.bad('INVALID_RANGE', 'Khoảng ngày không hợp lệ.');
    }
    if (to.getTime() - from.getTime() > MAX_DAYS * DAY_MS) {
      throw Err.bad('RANGE_TOO_LONG', `Chỉ xem tối đa ${MAX_DAYS} ngày mỗi lần.`);
    }
    const tree = q.unitId ? await this.withDescendants(q.unitId) : null;
    const visible = await this.scope.visibleUnitIds(actor);

    const qb = this.ds.getRepository(Activity).createQueryBuilder('a').leftJoinAndSelect('a.unit', 'u')
      .where('a.startAt < :to AND a.endAt >= :from', { from, to });
    if (visible) {
      qb.andWhere(new Brackets((w) =>
        w.where('a.unitId IN (:...ids)', { ids: visible })
          .orWhere('EXISTS (SELECT 1 FROM activity_co_units cu WHERE cu.activity_id = a.id AND cu.unit_id IN (:...ids))', { ids: visible })));
    }
    if (tree) qb.andWhere('a.unitId IN (:...tree)', { tree });
    const rows = await qb.orderBy('a.startAt', 'ASC').addOrderBy('a.id', 'ASC').take(MAX_ITEMS + 1).getMany();
    const events = await this.events.calendarItems(actor, from, to, tree, MAX_ITEMS + 1);

    const activities = rows.slice(0, MAX_ITEMS).map((a) => ({
      id: a.id, code: a.code, name: a.name, startAt: a.startAt, endAt: a.endAt, status: a.status,
      unit: a.unit ? { id: a.unit.id, name: a.unit.name } : null,
      coUnit: visible !== null && !visible.includes(a.unitId),
    }));
    return {
      from, to, activities, events: events.slice(0, MAX_ITEMS),
      truncated: rows.length > MAX_ITEMS || events.length > MAX_ITEMS,
    };
  }

  private async withDescendants(unitId: string): Promise<string[]> {
    const out = [unitId];
    let frontier = [unitId];
    for (let depth = 0; depth < 5 && frontier.length; depth++) {
      const kids = await this.ds.getRepository(Unit).find({ where: { parentId: In(frontier) }, select: ['id'] });
      frontier = kids.map((k) => k.id).filter((k) => !out.includes(k));
      out.push(...frontier);
    }
    return out;
  }
}
