// /api/admin: duyet luot diem danh, chot su kien - quyen va pham vi kiem tra o service
import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ReasonDto } from '../common/dto/reason.dto';
import { AttendancesService } from './attendances.service';
import {
  AttendanceListQuery, BulkDto, EditAttendanceAdminDto, ManualAttendanceDto, ReviewDto,
} from './dto/attendance.dto';
import { ReviewService } from './review.service';

// ma xac nhan va thong tin sinh vien: khong cho trinh duyet / proxy luu lai
const NO_STORE = 'no-store';

@Controller('admin')
export class AttendancesController {
  constructor(private readonly attendances: AttendancesService, private readonly review: ReviewService) {}

  @Header('Cache-Control', NO_STORE)
  @Get('events/:id/attendances')
  list(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Query() q: AttendanceListQuery) {
    return this.attendances.list(u, id, q);
  }

  // [BM] xuat Excel: cung bo loc voi danh sach; ten tep co dinh (khong dua tieu de su kien vao header)
  @Get('events/:id/attendances.xlsx')
  async exportXlsx(
    @CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Query() q: AttendanceListQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.attendances.exportXlsx(u, id, q);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="diem-danh-su-kien.xlsx"', 'Cache-Control': NO_STORE,
    });
    return new StreamableFile(file);
  }

  @Header('Cache-Control', NO_STORE)
  @Get('events/:id/attendances/summary')
  summary(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendances.summary(u, id);
  }

  // [NV] A07: ngan keo chi tiet - lich su sua, su kien khac cua cung MSSV
  @Header('Cache-Control', NO_STORE)
  @Get('attendances/:id')
  detail(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendances.detail(u, id);
  }

  @Post('events/:id/attendances')
  createManual(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualAttendanceDto) {
    return this.attendances.createManual(u, id, dto);
  }

  @Post('attendances/bulk') @HttpCode(200)
  bulk(@CurrentUser() u: CurrentUserType, @Body() dto: BulkDto) {
    return this.attendances.bulk(u, dto);
  }

  @Patch('attendances/:id')
  edit(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditAttendanceAdminDto) {
    return this.attendances.editOne(u, id, dto);
  }

  @Patch('attendances/:id/review')
  reviewOne(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.attendances.reviewOne(u, id, dto);
  }

  @Post('attendances/:id/void') @HttpCode(200)
  void(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.attendances.setVoided(u, id, dto.reason, true);
  }

  @Post('attendances/:id/restore') @HttpCode(200)
  restore(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.attendances.setVoided(u, id, dto.reason, false);
  }

  // ---- giai doan duyet cua su kien ----

  @Post('events/:id/review/start') @HttpCode(200)
  startReview(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.startReview(u, id);
  }

  @Post('events/:id/finalize') @HttpCode(200)
  finalize(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.finalize(u, id);
  }

  // [NV] 3.6: chi Doan truong mo khoa su kien da chot, bat buoc co ly do
  @Roles('SCHOOL_ADMIN')
  @Post('events/:id/unlock') @HttpCode(200)
  unlock(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.review.unlock(u, id, dto.reason);
  }
}
