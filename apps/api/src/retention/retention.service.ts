// Ha tang luu tru du lieu: sau data_retention_months thang, xoa du lieu dinh vi / mang cua luot diem danh
// (lat, lng, khoang cach, IP, trinh duyet). Giu MSSV, ho ten, thoi gian va ket qua duyet vi con dung cho diem ren luyen va tra cuu.
// Dac ta he thong 8.5 (quyen rieng tu du lieu vi tri).
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_ENV } from '../config/app-config.module';
import { AppEnv } from '../config/env';
import { SettingsService } from '../settings/settings.service';

const BATCH = 1000;
const FIRST_RUN_MS = 5 * 60_000;
const EVERY_MS = 24 * 3600_000;

// lui "months" thang theo UTC (31/8 lui 1 thang -> 1/8 + ... dung Date.UTC de khong tran thang)
export function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Retention');
  private first: NodeJS.Timeout | null = null;
  private every: NodeJS.Timeout | null = null;
  private running: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    if (!this.env.flagWorkerEnabled) return; // cung co bat / tat voi cac tac vu nen khac; test tat va tu goi run()
    const tick = () => { this.running = this.running.then(() => this.run()).then((n) => n > 0 && this.log.log(`Da xoa du lieu dinh vi cua ${n} luot diem danh qua han luu tru`)).catch((e) => this.log.error(String(e))); };
    this.first = setTimeout(tick, FIRST_RUN_MS);
    this.every = setInterval(tick, EVERY_MS);
    this.first.unref();
    this.every.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.first) clearTimeout(this.first);
    if (this.every) clearInterval(this.every);
    await this.running;
  }

  // Tra so luot da xoa du lieu dinh vi. Chay lai nhieu lan van an toan (chi cham dong con du lieu).
  async run(now = new Date()): Promise<number> {
    const months = Number(await this.settings.get('data_retention_months'));
    if (!Number.isInteger(months) || months < 1) return 0; // cau hinh hong: khong xoa gi
    const cutoff = monthsAgo(now, months);
    let total = 0;
    for (;;) {
      const r = await this.ds.query(
        `UPDATE attendances SET lat = NULL, lng = NULL, distance_m = NULL, ip = NULL, user_agent = NULL
         WHERE checkin_at < ? AND (lat IS NOT NULL OR lng IS NOT NULL OR distance_m IS NOT NULL OR ip IS NOT NULL OR user_agent IS NOT NULL)
         ORDER BY checkin_at LIMIT ${BATCH}`,
        [cutoff],
      );
      const n = Number(r.affectedRows ?? 0);
      total += n;
      if (n < BATCH) return total;
    }
  }
}
