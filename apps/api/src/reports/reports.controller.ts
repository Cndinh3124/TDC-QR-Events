// /api/admin/reports - bao cao DRL; pham vi theo su kien + khoa kiem tra o service
import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { CurrentUser } from '../common/decorators';
import { DrlReportQuery } from './reports.dto';
import { ReportsService } from './reports.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Header('Cache-Control', 'no-store')
  @Get('drl')
  drl(@CurrentUser() u: CurrentUserType, @Query() q: DrlReportQuery) {
    return this.reports.drl(u, q);
  }

  @Get('drl.xlsx')
  async drlXlsx(@CurrentUser() u: CurrentUserType, @Query() q: DrlReportQuery, @Res({ passthrough: true }) res: Response) {
    const file = await this.reports.exportXlsx(u, q);
    // ten tep co dinh, khong dua du lieu nguoi dung vao header
    res.set({ 'Content-Type': XLSX, 'Content-Disposition': 'attachment; filename="tong-hop-drl.xlsx"', 'Cache-Control': 'no-store' });
    return new StreamableFile(file);
  }
}
