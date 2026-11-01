// Token QR vao / ra va ma 4 so cua su kien - dac ta 3.2, 5.2
// [BM] token 128-bit ngau nhien; xoay ma = tat ma cu ngay (is_active = false) roi them ma moi.
import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, randomInt } from 'crypto';
import { EntityManager } from 'typeorm';
import { APP_ENV } from '../config/app-config.module';
import { AppEnv } from '../config/env';
import { Event } from './entities/event.entity';
import { EventQrToken, QrPurpose } from './entities/event-qr-token.entity';

export interface QrInfo {
  purpose: QrPurpose;
  token: string;
  url: string;
  createdAt: Date;
}

export interface EventQr {
  checkin: QrInfo | null;
  checkout: QrInfo | null;
}

@Injectable()
export class QrService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  newToken(): string {
    return randomBytes(16).toString('base64url'); // 22 ky tu, 128-bit
  }

  newVerifyCode(): string {
    return String(randomInt(0, 10000)).padStart(4, '0');
  }

  // [BM] HMAC theo su kien: cung ma 4 so o hai su kien cho hash khac nhau. Giai doan 3 dung lai ham nay de kiem tra.
  hashVerifyCode(eventId: string, code: string): string {
    return createHmac('sha256', this.env.jwtAccessSecret).update(`verify-code:${eventId}:${code}`).digest('hex');
  }

  // [NV] 3.2: noi dung QR chi la URL chua token, khong chua thong tin su kien
  urlFor(token: string): string {
    return `${this.env.publicBaseUrl}/diem-danh/${token}`;
  }

  // Dua ma 4 so ve dung voi muc kiem soat: Chat thi phai co, khong Chat thi xoa.
  // Tra ma moi (ro) neu vua sinh, de hien cho QTV dung mot lan.
  syncVerifyCode(event: Event): string | null {
    if (event.controlLevel !== 'TIGHT') {
      event.verifyCodeHash = null;
      return null;
    }
    if (event.verifyCodeHash) return null;
    return this.rotateVerifyCode(event);
  }

  rotateVerifyCode(event: Event): string {
    const code = this.newVerifyCode();
    event.verifyCodeHash = this.hashVerifyCode(event.id, code);
    return code;
  }

  // Dam bao dung token dang hoat dong: luon co CHECKIN; co CHECKOUT khi requireCheckout
  async syncTokens(m: EntityManager, event: Event): Promise<void> {
    const active = await this.activePurposes(m, event.id);
    if (!active.has('CHECKIN')) await this.issue(m, event.id, 'CHECKIN');
    if (event.requireCheckout && !active.has('CHECKOUT')) await this.issue(m, event.id, 'CHECKOUT');
    if (!event.requireCheckout && active.has('CHECKOUT')) await this.deactivate(m, event.id, 'CHECKOUT');
  }

  async issue(m: EntityManager, eventId: string, purpose: QrPurpose): Promise<EventQrToken> {
    return m.save(EventQrToken, m.create(EventQrToken, { eventId, purpose, token: this.newToken(), isActive: true }));
  }

  // [BM] ma cu het hieu luc ngay - dac ta 3.2
  async rotate(m: EntityManager, eventId: string, purpose: QrPurpose): Promise<EventQrToken> {
    await this.deactivate(m, eventId, purpose);
    return this.issue(m, eventId, purpose);
  }

  async deactivate(m: EntityManager, eventId: string, purpose?: QrPurpose): Promise<void> {
    await m.update(EventQrToken, purpose ? { eventId, purpose, isActive: true } : { eventId, isActive: true }, {
      isActive: false,
    });
  }

  async getActive(m: EntityManager, eventId: string): Promise<EventQr> {
    const rows = await m.find(EventQrToken, { where: { eventId, isActive: true } });
    const info = (p: QrPurpose): QrInfo | null => {
      const r = rows.find((x) => x.purpose === p);
      return r ? { purpose: p, token: r.token, url: this.urlFor(r.token), createdAt: r.createdAt } : null;
    };
    return { checkin: info('CHECKIN'), checkout: info('CHECKOUT') };
  }

  private async activePurposes(m: EntityManager, eventId: string): Promise<Set<QrPurpose>> {
    const rows = await m.find(EventQrToken, { where: { eventId, isActive: true }, select: ['purpose'] });
    return new Set(rows.map((r) => r.purpose));
  }
}
