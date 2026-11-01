// Nam hoc, linh vuc hoat dong, thong bao - dac ta quan-ly-hoat-dong 2, 3.1, 4.3
import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ReasonDto } from '../common/dto/reason.dto';
import { AcademicYearsService } from './academic-years.service';
import { CategoriesService } from './categories.service';
import { ActivityStatsService } from './activity-stats.service';
import { ActivityStatsQuery, CreateCategoryDto, CreateYearDto, NotificationQuery, UpdateCategoryDto, UpdateYearDto } from './dto/admin.dto';
import { NotificationsService } from './notifications.service';

@Controller('admin/academic-years')
export class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  @Get()
  list() {
    return this.years.list();
  }

  @Roles('SCHOOL_ADMIN')
  @Post()
  create(@CurrentUser() u: CurrentUserType, @Body() dto: CreateYearDto) {
    return this.years.create(u, dto);
  }

  @Roles('SCHOOL_ADMIN')
  @Patch(':id')
  update(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateYearDto) {
    return this.years.update(u, id, dto);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/lock') @HttpCode(200)
  lock(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.years.setLocked(u, id, true, dto.reason);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/unlock') @HttpCode(200)
  unlock(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.years.setLocked(u, id, false, dto.reason);
  }
}

@Controller('admin/activity-categories')
export class ActivityCategoriesController {
  constructor(private readonly cats: CategoriesService) {}

  @Get()
  list(@CurrentUser() u: CurrentUserType) {
    return this.cats.list(u.role === 'SCHOOL_ADMIN');
  }

  @Roles('SCHOOL_ADMIN')
  @Post()
  create(@CurrentUser() u: CurrentUserType, @Body() dto: CreateCategoryDto) {
    return this.cats.create(u, dto);
  }

  @Roles('SCHOOL_ADMIN')
  @Patch(':id')
  update(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.cats.update(u, id, dto);
  }
}

@Controller('admin/notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: CurrentUserType, @Query() q: NotificationQuery) {
    return this.svc.list(u, q);
  }

  @Get('unread-count')
  unread(@CurrentUser() u: CurrentUserType) {
    return this.svc.unreadCount(u);
  }

  @Post('read-all') @HttpCode(204)
  async readAll(@CurrentUser() u: CurrentUserType) {
    await this.svc.markAllRead(u);
  }

  @Post(':id/read') @HttpCode(204)
  async read(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.markRead(u, id);
  }
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('admin/activity-stats')
export class ActivityStatsController {
  constructor(private readonly stats: ActivityStatsService) {}

  @Header('Cache-Control', 'no-store')
  @Get()
  get(@CurrentUser() u: CurrentUserType, @Query() q: ActivityStatsQuery) {
    return this.stats.stats(u, q);
  }

  @Get('export.xlsx')
  async export(@CurrentUser() u: CurrentUserType, @Query() q: ActivityStatsQuery, @Res({ passthrough: true }) res: Response) {
    const file = await this.stats.exportXlsx(u, q);
    // ten tep co dinh, khong dua du lieu nguoi dung vao header
    res.set({ 'Content-Type': XLSX, 'Content-Disposition': 'attachment; filename="hoat-dong.xlsx"', 'Cache-Control': 'no-store' });
    return new StreamableFile(file);
  }
}
