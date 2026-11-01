// Kiem tra pham vi don vi - dac ta 2.3, 8.2
// [BM] moi truy van / thao tac sua xoa phai qua day, khong chi dua vao giao dien.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Err } from './errors';
import { CurrentUser } from './current-user';
import { Unit } from '../units/entities/unit.entity';

@Injectable()
export class UnitScopeService {
  constructor(@InjectRepository(Unit) private readonly units: Repository<Unit>) {}

  // Danh sach id don vi nguoi dung duoc phep thay. null = khong gioi han (QTV truong).
  async visibleUnitIds(actor: CurrentUser): Promise<string[] | null> {
    if (actor.role === 'SCHOOL_ADMIN') return null;
    // quan ly khoa: don vi cua minh + toan bo cap duoi (cay don vi, di xuong theo parent_id)
    const ids = [actor.unitId];
    let frontier = [actor.unitId];
    for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
      const children = await this.units.find({ where: { parentId: In(frontier) }, select: ['id'] });
      frontier = children.map((c) => c.id).filter((id) => !ids.includes(id));
      ids.push(...frontier);
    }
    return ids;
  }

  async canAccessUnit(actor: CurrentUser, unitId: string): Promise<boolean> {
    const ids = await this.visibleUnitIds(actor);
    return ids === null || ids.includes(unitId);
  }

  // Nem 404 (khong phai 403) de khong lo su ton tai cua du lieu ngoai pham vi
  async assertCanAccessUnit(actor: CurrentUser, unitId: string): Promise<void> {
    if (!(await this.canAccessUnit(actor, unitId))) throw Err.notFound('đơn vị');
  }
}
