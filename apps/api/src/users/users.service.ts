// Quan ly tai khoan quan tri - dac ta 3.7 (bang Tai khoan quan tri), 8.1
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, EntityManager, FindOptionsWhere, Like, Not, Repository } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import { CurrentUser } from '../common/current-user';
import { Page } from '../common/dto/pagination.dto';
import { Err, isDuplicateError } from '../common/errors';
import { assertStrongPassword } from '../common/password-policy';
import { escapeLike } from '../common/sql';
import { Unit } from '../units/entities/unit.entity';
import { toUserDto, userAuditView, UserDto } from './dto/user.dto';
import { CreateUserDto, UpdateUserDto, UserListQuery } from './dto/users.dto';
import { AdminUser } from './entities/admin-user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(AdminUser) private readonly users: Repository<AdminUser>,
    @InjectRepository(Unit) private readonly units: Repository<Unit>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async list(q: UserListQuery): Promise<Page<UserDto>> {
    const where: FindOptionsWhere<AdminUser> = {};
    if (q.unitId) where.unitId = q.unitId;
    if (q.status) where.isActive = q.status === 'active';
    // tim theo email hoac ho ten
    const base = q.q ? [{ ...where, email: Like(`%${escapeLike(q.q)}%`) }, { ...where, fullName: Like(`%${escapeLike(q.q)}%`) }] : where;
    const [rows, total] = await this.users.findAndCount({
      where: base,
      order: { createdAt: 'DESC' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    return { items: rows.map(toUserDto), total, page: q.page, limit: q.limit };
  }

  async get(id: string): Promise<UserDto> {
    return toUserDto(await this.findOrFail(id));
  }

  async create(actor: CurrentUser, dto: CreateUserDto): Promise<UserDto> {
    // B1 [BM]: mat khau dat chinh sach
    assertStrongPassword(dto.password, dto.email);
    // B2 [NV] 2.2: vai tro va loai don vi phai khop
    await this.assertRoleMatchesUnit(dto.role, dto.unitId);

    // B3: luu TK, buoc doi mat khau o lan dau
    try {
      const user = await this.users.save(
        this.users.create({
          email: dto.email,
          fullName: dto.fullName,
          role: dto.role,
          unitId: dto.unitId,
          passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
          isActive: true,
          mustChangePassword: true,
        }),
      );
      await this.audit.log(actor, 'USER_CREATE', 'user', user.id, { after: userAuditView(user) });
      return toUserDto(user);
    } catch (e) {
      if (isDuplicateError(e)) throw Err.conflict('EMAIL_EXISTS', 'Email này đã được dùng cho tài khoản khác.');
      throw e;
    }
  }

  async update(actor: CurrentUser, id: string, dto: UpdateUserDto): Promise<UserDto> {
    return this.ds.transaction(async (m) => {
      const user = await this.findOrFail(id, m);
      const before = userAuditView(user);

      const newRole = dto.role ?? user.role;
      const newUnit = dto.unitId ?? user.unitId;
      const accessChanged = newRole !== user.role || newUnit !== user.unitId;

      if (accessChanged) {
        // [NV] 3.7: khong tu ha quyen / chuyen don vi cua chinh minh
        if (user.id === actor.id) throw Err.bad('SELF_ACTION', 'Bạn không thể đổi vai trò hoặc đơn vị của chính mình.');
        await this.assertRoleMatchesUnit(newRole, newUnit);
        if (user.role === 'SCHOOL_ADMIN' && newRole !== 'SCHOOL_ADMIN') await this.assertNotLastSchoolAdmin(m, user);
      }
      if (dto.fullName !== undefined) user.fullName = dto.fullName;
      user.role = newRole;
      user.unitId = newUnit;
      await m.save(user);

      await this.audit.log(actor, 'USER_UPDATE', 'user', id, { before, after: userAuditView(user) });
      // [BM] doi quyen/don vi -> buoc dang nhap lai
      if (accessChanged) await this.tokens.revokeAllForUser(id);
      return toUserDto(user);
    });
  }

  async lock(actor: CurrentUser, id: string, reason: string): Promise<UserDto> {
    return this.ds.transaction(async (m) => {
      const user = await this.findOrFail(id, m);
      if (user.id === actor.id) throw Err.bad('SELF_ACTION', 'Bạn không thể tự khóa tài khoản của mình.');
      if (user.role === 'SCHOOL_ADMIN') await this.assertNotLastSchoolAdmin(m, user);

      const before = userAuditView(user);
      user.isActive = false;
      await m.save(user);
      // [BM] dang xuat ngay lap tuc
      await this.tokens.revokeAllForUser(id);
      await this.audit.log(actor, 'USER_LOCK', 'user', id, { before, after: userAuditView(user), reason });
      return toUserDto(user);
    });
  }

  async unlock(actor: CurrentUser, id: string, reason: string): Promise<UserDto> {
    const user = await this.findOrFail(id);
    const before = userAuditView(user);
    user.isActive = true;
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await this.users.save(user);
    await this.audit.log(actor, 'USER_UNLOCK', 'user', id, { before, after: userAuditView(user), reason });
    return toUserDto(user);
  }

  async resetPassword(actor: CurrentUser, id: string, newPassword: string): Promise<UserDto> {
    const user = await this.findOrFail(id);
    assertStrongPassword(newPassword, user.email);
    user.passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    user.mustChangePassword = true; // nguoi dung phai tu doi lai
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await this.users.save(user);
    await this.tokens.revokeAllForUser(id);
    // [BM] khong ghi mat khau vao nhat ky
    await this.audit.log(actor, 'USER_RESET_PASSWORD', 'user', id);
    return toUserDto(user);
  }

  // Xoa cung chi khi TK chua tung thuc hien thao tac nao (chua co dong nhat ky) - dac ta 3.7
  async remove(actor: CurrentUser, id: string, reason: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const user = await this.findOrFail(id, m);
      if (user.id === actor.id) throw Err.bad('SELF_ACTION', 'Bạn không thể tự xóa tài khoản của mình.');
      if (user.role === 'SCHOOL_ADMIN') await this.assertNotLastSchoolAdmin(m, user);

      const acted = await m.count(AuditLog, { where: { actorId: id } });
      if (acted > 0 || user.lastLoginAt) {
        throw Err.conflict('USER_HAS_ACTIVITY', 'Tài khoản đã có thao tác trong hệ thống, chỉ có thể khóa.');
      }
      await m.delete(AdminUser, id); // refresh_tokens xoa theo (FK cascade)
      await this.audit.log(actor, 'USER_DELETE', 'user', id, { before: userAuditView(user), reason });
    });
  }

  // ---- ham phu ----

  private async findOrFail(id: string, m?: EntityManager): Promise<AdminUser> {
    const repo = m ? m.getRepository(AdminUser) : this.users;
    const user = await repo.findOne({ where: { id } });
    if (!user) throw Err.notFound('tài khoản');
    return user;
  }

  // [NV] 2.2: QTV truong phai thuoc don vi SCHOOL, quan ly khoa thuoc don vi FACULTY dang hoat dong
  private async assertRoleMatchesUnit(role: string, unitId: string): Promise<void> {
    const unit = await this.units.findOne({ where: { id: unitId } });
    if (!unit || !unit.isActive) throw Err.bad('UNIT_INVALID', 'Đơn vị không tồn tại hoặc đã ngừng hoạt động.');
    const expected = role === 'SCHOOL_ADMIN' ? 'SCHOOL' : 'FACULTY';
    if (unit.type !== expected) {
      throw Err.bad('ROLE_UNIT_MISMATCH', 'Vai trò không phù hợp với đơn vị đã chọn.');
    }
  }

  // [NV] 3.7: luon con it nhat 1 QTV truong dang hoat dong. Khoa hang de tranh 2 nguoi cung bi go.
  private async assertNotLastSchoolAdmin(m: EntityManager, target: AdminUser): Promise<void> {
    const others = await m.find(AdminUser, {
      where: { role: 'SCHOOL_ADMIN', isActive: true, id: Not(target.id) },
      lock: { mode: 'pessimistic_write' },
      select: ['id'],
    });
    if (others.length === 0) {
      throw Err.bad('LAST_SCHOOL_ADMIN', 'Phải còn ít nhất một quản trị Đoàn trường đang hoạt động.');
    }
  }
}
