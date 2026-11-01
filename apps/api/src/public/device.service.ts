// Ma thiet bi: server cap, ky HMAC, gan MSSV voi thiet bi - dac ta 4
// [BM] server khong tin chuoi "thiet bi" do client tu gui: chi nhan gia tri co chu ky dung do chinh server cap.
// DB chi luu hash cua ma thiet bi.
import { Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { APP_ENV } from '../config/app-config.module';
import { AppEnv } from '../config/env';

export interface DeviceIdentity {
  code: string; // 256-bit ngau nhien, base64url (43 ky tu)
  id: string; // sha256(code), khoa o DB
  token: string; // code.chu_ky - gia tri cookie
}

const CODE_RE = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class DeviceService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  issue(): DeviceIdentity {
    return this.identity(randomBytes(32).toString('base64url'));
  }

  // gia tri sai dinh dang / sai chu ky -> null (coi nhu chua co cookie)
  parse(token: unknown): DeviceIdentity | null {
    if (typeof token !== 'string' || token.length > 100) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !CODE_RE.test(parts[0])) return null;
    const expected = Buffer.from(this.sign(parts[0]));
    const given = Buffer.from(parts[1]);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return this.identity(parts[0]);
  }

  fingerprintHash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private identity(code: string): DeviceIdentity {
    return {
      code,
      id: createHash('sha256').update(code).digest('hex'),
      token: `${code}.${this.sign(code)}`,
    };
  }

  private sign(code: string): string {
    return createHmac('sha256', this.env.deviceSecret).update(`device:${code}`).digest('base64url');
  }
}
