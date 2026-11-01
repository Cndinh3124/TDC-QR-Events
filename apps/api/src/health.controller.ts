// /api/healthz cho load balancer / docker healthcheck - dac ta 8.6
// Cong khai nhung chi tra trang thai, khong lo thong tin he thong.
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators';

@Controller('healthz')
export class HealthController {
  constructor(private readonly ds: DataSource) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    try {
      await this.ds.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ statusCode: 503, code: 'DB_DOWN', message: 'Không kết nối được cơ sở dữ liệu.' });
    }
    return { status: 'ok' };
  }
}
