// Gioi han tan suat theo khoa (thiet bi / IP) trong bo nho, cua so co dinh - dac ta 8.4
// Moi ban backend co bo dem rieng nen voi 2 ban gioi han thuc te toi da gap doi; chap nhan cho diem danh.
// Gioi han nhap sai ma 4 so KHONG dung o day (can chinh xac, nam trong DB).
import { Injectable, OnModuleDestroy } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    // don dong het han de bo nho khong phinh ra theo so thiet bi
    this.sweeper = setInterval(() => this.sweep(Date.now()), 30_000);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  // tra so giay phai cho neu vuot gioi han, null neu con duoc phep
  hit(key: string, limit: number, windowMs: number, now = Date.now()): number | null {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return limit >= 1 ? null : Math.ceil(windowMs / 1000);
    }
    b.count += 1;
    return b.count <= limit ? null : Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  }

  sweep(now: number): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}
