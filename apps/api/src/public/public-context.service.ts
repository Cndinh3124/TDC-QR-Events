// Buoc dau chung cua moi request cong khai (sau PublicGuard): nhan dien / cap ma thiet bi,
// gioi han tan suat theo thiet bi - dac ta 4, 8.4
import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_ENV } from '../config/app-config.module';
import { AppEnv } from '../config/env';
import { DeviceIdentity, DeviceService } from './device.service';
import {
  DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_MS, DEVICE_COOKIE_PATH, DEVICE_HEADER,
} from './public.constants';
import { tooManyRequests } from './public.guard';
import { RateLimitService } from './rate-limit.service';

export interface PublicContext {
  ip: string | null;
  userAgent: string | null;
  device: DeviceIdentity | null;
  // true khi request khong kem cookie / ma thiet bi hop le va server vua cap ma moi (gan co NEW_DEVICE)
  isNewDevice: boolean;
}

export interface BeginOptions {
  issue?: boolean; // chua co ma thiet bi hop le thi cap moi
  limit?: 'checkin' | 'edit'; // gioi han theo thiet bi (bo qua = khong gioi han rieng)
}

@Injectable()
export class PublicContextService {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly devices: DeviceService,
    private readonly limits: RateLimitService,
  ) {}

  begin(req: Request, res: Response, o: BeginOptions = {}): PublicContext {
    const ip = req.ip ? req.ip.slice(0, 45) : null;

    let device = this.devices.parse(req.cookies?.[DEVICE_COOKIE]);
    let restored = false;
    if (!device) {
      device = this.devices.parse(req.headers[DEVICE_HEADER]);
      restored = device !== null;
    }
    const isNewDevice = !device && !!o.issue;
    if (!device && o.issue) device = this.devices.issue();
    // cookie bi xoa nhung con ban sao o localStorage: dat lai cookie
    if (device && (isNewDevice || restored)) this.setCookie(res, device.token);

    this.limitDevice(res, o.limit, device, isNewDevice, ip);
    const ua = req.headers['user-agent'];
    return { ip, userAgent: typeof ua === 'string' ? ua.slice(0, 255) : null, device, isNewDevice };
  }

  // [BM] ma thiet bi tao mien phi nen request khong co cookie bi gioi han theo IP rieng, chat hon
  private limitDevice(res: Response, kind: BeginOptions['limit'], d: DeviceIdentity | null, isNew: boolean, ip: string | null) {
    if (!kind) return;
    if (!d || isNew) {
      this.enforce(res, this.limits.hit(`nocookie:${ip}`, this.env.publicNoCookieRateLimitPerMin, 60_000));
    } else if (kind === 'checkin') {
      this.enforce(res, this.limits.hit(`dev:${d.id}`, this.env.publicDeviceRateLimitPerMin, 60_000));
    } else {
      this.enforce(res, this.limits.hit(`edit:${d.id}`, this.env.publicEditRateLimitPerHour, 3600_000));
    }
  }

  private enforce(res: Response, retryAfterSec: number | null): void {
    if (retryAfterSec !== null) tooManyRequests(res, retryAfterSec);
  }

  private setCookie(res: Response, token: string): void {
    res.cookie(DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: this.env.cookieSecure,
      sameSite: 'lax',
      maxAge: DEVICE_COOKIE_MAX_AGE_MS,
      path: DEVICE_COOKIE_PATH,
    });
  }
}
