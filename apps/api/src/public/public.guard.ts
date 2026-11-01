// Guard cua /api/public: tran IP (chong DDoS) + kiem tra Origin cho request ghi - dac ta 8.4, 8.5
// [BM] Chay TRUOC ValidationPipe nen request body sai cung bi dem vao tran IP va bi chan Origin.
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_ENV } from '../config/app-config.module';
import { AppEnv } from '../config/env';
import { appError } from '../common/errors';
import { RateLimitService } from './rate-limit.service';

export function tooManyRequests(res: Response, retryAfterSec: number): never {
  res.setHeader('Retry-After', String(retryAfterSec));
  throw appError(429, 'TOO_MANY_REQUESTS', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.');
}

@Injectable()
export class PublicGuard implements CanActivate {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly limits: RateLimitService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    // [BM] tran IP chi chong DDoS: ca hoi truong dung chung mot IP wifi
    const wait = this.limits.hit(`ip:${req.ip}`, this.env.publicIpRateLimitPerMin, 60_000);
    if (wait !== null) tooManyRequests(res, wait);
    // [BM] chong CSRF cho request ghi dung cookie: neu co Origin thi phai la trang diem danh
    const origin = req.headers.origin;
    if (req.method !== 'GET' && origin !== undefined && origin !== this.env.publicBaseUrl) {
      throw appError(403, 'BAD_ORIGIN', 'Yêu cầu không đến từ trang điểm danh hợp lệ.');
    }
    return true;
  }
}
