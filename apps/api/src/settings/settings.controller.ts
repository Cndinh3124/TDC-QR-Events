// /api/admin/settings - chi QTV Doan truong
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { SettingsService } from './settings.service';

@Controller('admin/settings')
@Roles('SCHOOL_ADMIN')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll() {
    return this.settings.getAll();
  }

  // body la object { ten_khoa: gia_tri }; whitelist khoa nam trong service
  @Patch()
  update(@CurrentUser() u: CurrentUserType, @Body() body: Record<string, unknown>) {
    return this.settings.update(u, body && typeof body === 'object' && !Array.isArray(body) ? body : {});
  }
}
