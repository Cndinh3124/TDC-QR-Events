// /api/admin/events - ca hai vai tro dung duoc, pham vi don vi kiem tra o service
import {
  Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ReasonDto } from '../common/dto/reason.dto';
import {
  CreateEventDto, DuplicateEventDto, EventListQuery, FacultyViewDto, QrPurposeQuery, RotateQrDto, UpdateEventDto,
} from './dto/event.dto';
import { EventsService } from './events.service';

// ma QR va ma 4 so la bi mat: khong cho trinh duyet / proxy luu lai
const NO_STORE = 'no-store';

@Controller('admin/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@CurrentUser() u: CurrentUserType, @Query() q: EventListQuery) {
    return this.events.list(u, q);
  }

  @Get(':id')
  get(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.get(u, id);
  }

  // so dem truc tiep (polling 10 giay o man theo doi)
  @Header('Cache-Control', NO_STORE)
  @Get(':id/counters')
  counters(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.counters(u, id);
  }

  @Header('Cache-Control', NO_STORE)
  @Post()
  create(@CurrentUser() u: CurrentUserType, @Body() dto: CreateEventDto) {
    return this.events.create(u, dto);
  }

  @Header('Cache-Control', NO_STORE)
  @Patch(':id')
  update(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(u, id, dto);
  }

  @Header('Cache-Control', NO_STORE)
  @Post(':id/duplicate')
  duplicate(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DuplicateEventDto) {
    return this.events.duplicate(u, id, dto);
  }

  @Post(':id/publish') @HttpCode(200)
  publish(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.publish(u, id);
  }

  @Post(':id/open') @HttpCode(200)
  open(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.open(u, id);
  }

  @Post(':id/close') @HttpCode(200)
  close(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.close(u, id);
  }

  @Post(':id/auto') @HttpCode(200)
  auto(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.auto(u, id);
  }

  @Post(':id/cancel') @HttpCode(200)
  cancel(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.events.cancel(u, id, dto.reason);
  }

  @Post(':id/archive') @HttpCode(200)
  archive(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.events.archive(u, id, dto.reason);
  }

  @Post(':id/restore') @HttpCode(200)
  restore(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.events.restore(u, id, dto.reason);
  }

  @Delete(':id') @HttpCode(204)
  async remove(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.events.remove(u, id, dto.reason);
  }

  // [NV] 2.2: chi Doan truong cho / thu hoi quyen xem cua cac khoa (tat ca hoac chon khoa)
  @Roles('SCHOOL_ADMIN')
  @Post(':id/faculty-view') @HttpCode(200)
  facultyView(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FacultyViewDto) {
    return this.events.setFacultyView(u, id, dto.mode, dto.unitIds, dto.reason);
  }

  // ---- ma QR ----

  @Header('Cache-Control', NO_STORE)
  @Get(':id/qr')
  qr(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.getQr(u, id);
  }

  @Header('Cache-Control', NO_STORE)
  @Post(':id/qr/rotate') @HttpCode(200)
  rotateQr(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RotateQrDto) {
    return this.events.rotateQr(u, id, dto.purpose, dto.reason);
  }

  @Header('Cache-Control', NO_STORE)
  @Post(':id/verify-code/rotate') @HttpCode(200)
  rotateVerifyCode(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.events.rotateVerifyCode(u, id, dto.reason);
  }

  @Get(':id/qr.png')
  async qrPng(
    @CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Query() q: QrPurposeQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.events.qrFile(u, id, q.purpose, 'png');
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': NO_STORE });
    return new StreamableFile(file);
  }

  @Get(':id/qr.pdf')
  async qrPdf(
    @CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Query() q: QrPurposeQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.events.qrFile(u, id, q.purpose, 'pdf');
    // ten tep co dinh: tieu de su kien do nguoi dung nhap, khong dua vao header
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="qr-${q.purpose.toLowerCase()}.pdf"`,
      'Cache-Control': NO_STORE,
    });
    return new StreamableFile(file);
  }
}
