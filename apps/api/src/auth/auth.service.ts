// Dang nhap, lam moi, dang xuat, doi mat khau - dac ta 8.1
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Err } from '../common/errors';
import { assertStrongPassword } from '../common/password-policy';
import { AdminUser } from '../users/entities/admin-user.entity';
import { toUserDto, UserDto } from '../users/dto/user.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { hashToken, REFRESH_TTL_MS, TokenService } from './token.service';

const MAX_FAILED = 5; // [NV] 8.1: khoa sau 5 lan sai
const LOCK_MS = 15 * 60 * 1000; // khoa 15 phut

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

@Injectable()
export class AuthService {
  // hash gia de thoi gian phan hoi khong phan biet "TK khong ton tai" voi "sai mat khau"
  private dummyHash: Promise<string> = argon2.hash('dummy-password-for-timing', { type: argon2.argon2id });

  constructor(
    @InjectRepository(AdminUser) private readonly users: Repository<AdminUser>,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly ds: DataSource,
  ) {}

  async login(email: string, password: string, ip: string): Promise<AuthResult> {
    const user = await this.users.findOne({ where: { email } });

    // B1 [BM]: luon ton thoi gian verify nhu nhau
    const hash = user ? user.passwordHash : await this.dummyHash;
    const passwordOk = await argon2.verify(hash, password).catch(() => false);

    // B2: TK khong ton tai / bi khoa / dang bi khoa tam -> cung mot thong bao chung
    if (!user || !user.isActive) throw Err.invalidLogin();
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw Err.invalidLogin();

    // B3: sai mat khau -> tang dem, du 5 lan thi khoa tam 15 phut
    if (!passwordOk) {
      await this.registerFailure(user, ip);
      throw Err.invalidLogin();
    }

    // B4: thanh cong -> xoa dem sai, ghi lan dang nhap cuoi
    await this.users.update(user.id, { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() });
    await this.audit.log({ id: user.id, ip }, 'LOGIN', 'user', user.id);

    return this.issueSession(user);
  }

  private async registerFailure(user: AdminUser, ip: string): Promise<void> {
    // tang dem nguyen tu de tranh mat luot khi nhieu request cung luc
    await this.users.increment({ id: user.id }, 'failedLoginCount', 1);
    const fresh = await this.users.findOneByOrFail({ id: user.id });
    if (fresh.failedLoginCount >= MAX_FAILED) {
      await this.users.update(user.id, { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) });
      await this.audit.log({ id: null, ip }, 'LOGIN_LOCKED', 'user', user.id);
    } else {
      await this.audit.log({ id: null, ip }, 'LOGIN_FAILED', 'user', user.id);
    }
  }

  // Xoay vong refresh token. [BM] dung lai token da thu hoi = nghi bi danh cap -> thu hoi het.
  async refresh(rawToken: string | undefined): Promise<AuthResult> {
    if (!rawToken) throw Err.unauthorized();
    const hash = hashToken(rawToken);

    const result = await this.ds.transaction(async (m) => {
      const row = await m.findOne(RefreshToken, { where: { tokenHash: hash }, lock: { mode: 'pessimistic_write' } });
      if (!row) return { error: true as const };
      if (row.revokedAt) {
        return { error: true as const, revokeUser: row.userId };
      }
      if (row.expiresAt.getTime() < Date.now()) return { error: true as const };

      const user = await m.findOne(AdminUser, { where: { id: row.userId } });
      if (!user || !user.isActive) return { error: true as const };

      // cap token moi (chi luu hash), danh dau token cu da thay the
      const rawNext = randomBytes(32).toString('base64url');
      const saved = await m.save(
        m.create(RefreshToken, {
          userId: user.id,
          tokenHash: hashToken(rawNext),
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        }),
      );
      await m.update(RefreshToken, row.id, { revokedAt: new Date(), replacedBy: saved.id });
      return { error: false as const, user, rawNext };
    });

    if (result.error) {
      if ('revokeUser' in result && result.revokeUser) await this.tokens.revokeAllForUser(result.revokeUser);
      throw Err.unauthorized();
    }
    return {
      accessToken: await this.tokens.signAccess(result.user.id),
      refreshToken: result.rawNext,
      user: toUserDto(result.user),
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.tokens.revokeByToken(rawToken);
  }

  async me(actor: CurrentUser): Promise<UserDto> {
    return toUserDto(await this.users.findOneByOrFail({ id: actor.id }));
  }

  async changePassword(actor: CurrentUser, current: string, next: string): Promise<AuthResult> {
    const user = await this.users.findOneByOrFail({ id: actor.id });
    // B1: xac nhan mat khau hien tai
    if (!(await argon2.verify(user.passwordHash, current).catch(() => false))) {
      throw Err.bad('WRONG_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.');
    }
    // B2 [BM]: mat khau moi dat chinh sach, khac mat khau cu
    assertStrongPassword(next, user.email);
    if (current === next) throw Err.bad('WEAK_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');

    // B3: luu hash moi, thu hoi moi phien cu, cap phien moi cho may dang dung
    user.passwordHash = await argon2.hash(next, { type: argon2.argon2id });
    user.mustChangePassword = false;
    await this.users.save(user);
    await this.tokens.revokeAllForUser(user.id);
    await this.audit.log({ id: user.id, ip: actor.ip }, 'PASSWORD_CHANGE', 'user', user.id);
    return this.issueSession(user);
  }

  private async issueSession(user: AdminUser): Promise<AuthResult> {
    const refresh = await this.tokens.issueRefresh(user.id);
    return {
      accessToken: await this.tokens.signAccess(user.id),
      refreshToken: refresh.token,
      user: toUserDto(user),
    };
  }
}
