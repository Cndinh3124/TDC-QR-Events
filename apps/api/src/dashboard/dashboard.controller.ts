// /api/admin/dashboard - tong quan + nhac viec; moi vai tro deu goi duoc, pham vi kiem tra o service
import { Controller, Get, Header, Query } from '@nestjs/common';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { CurrentUser } from '../common/decorators';
import { OverviewQuery } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Header('Cache-Control', 'no-store')
  @Get('overview')
  overview(@CurrentUser() u: CurrentUserType, @Query() q: OverviewQuery) {
    return this.dashboard.overview(u, q);
  }

  @Header('Cache-Control', 'no-store')
  @Get('reminders')
  reminders(@CurrentUser() u: CurrentUserType) {
    return this.dashboard.reminders(u);
  }
}
