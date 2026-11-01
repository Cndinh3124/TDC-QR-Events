// Cap, xoay vong, thu hoi token - dac ta 8.1
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from './entities/refresh-token.entity';

export const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000; // refresh token song 7 ngay

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(RefreshToken) private readonly repo: Repository<RefreshToken>,
  ) {}

  signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }

  // [BM] refresh token 256-bit ngau nhien, chi luu hash
  async issueRefresh(userId: string): Promise<{ token: string; id: string }> {
    const token = randomBytes(32).toString('base64url');
    const row = await this.repo.save(
      this.repo.create({
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      }),
    );
    return { token, id: row.id };
  }

  // thu hoi toan bo token con hieu luc cua TK (doi mat khau, khoa, xoa quyen...)
  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeByToken(token: string): Promise<void> {
    await this.repo.update({ tokenHash: hashToken(token), revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
