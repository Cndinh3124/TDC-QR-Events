// API cong khai cho sinh vien - /api/public (dac ta 7). Khong can tai khoan.
// [BM] @Public + bo gioi han IP chung (3.000/phut khong du cho ca hoi truong dung chung mot IP);
// thay bang gioi han IP rieng cao hon + gioi han theo thiet bi trong PublicContextService.
import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators';
import { CheckinService } from './checkin.service';
import { AppealPublicService } from './appeal-public.service';
import { CreateAppealDto } from './dto/appeal.dto';
import { CheckinDto, CheckoutDto, EditAttendanceDto } from './dto/public.dto';
import { EditService } from './edit.service';
import { PublicGuard } from './public.guard';
import { PublicContextService } from './public-context.service';
import { QueryService } from './query.service';

// du lieu ca nhan va ma thiet bi: khong cho trinh duyet / proxy luu lai
const NO_STORE = 'no-store';

@Public()
@SkipThrottle()
@UseGuards(PublicGuard)
@Controller('public')
export class PublicController {
  constructor(
    private readonly ctx: PublicContextService,
    private readonly query: QueryService,
    private readonly checkins: CheckinService,
    private readonly edits: EditService,
    private readonly appeals: AppealPublicService,
  ) {}

  // danh sach khoa khong ca nhan hoa nen cache duoc
  @Get('units')
  @Header('Cache-Control', 'public, max-age=60')
  units(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.ctx.begin(req, res);
    return this.query.faculties();
  }

  @Get('events/by-token/:token')
  @Header('Cache-Control', NO_STORE)
  eventByToken(@Param('token') token: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const c = this.ctx.begin(req, res, { issue: true });
    return this.query.eventByToken(c.device!, token);
  }

  @Post('checkin')
  @Header('Cache-Control', NO_STORE)
  async checkin(@Body() dto: CheckinDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const c = this.ctx.begin(req, res, { issue: true, limit: 'checkin' });
    const r = await this.checkins.checkin(c, dto);
    res.status(r.created ? 201 : 200);
    return r.body;
  }

  @Post('checkout')
  @Header('Cache-Control', NO_STORE)
  async checkout(@Body() dto: CheckoutDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const c = this.ctx.begin(req, res, { issue: true, limit: 'checkin' });
    const r = await this.checkins.checkout(c, dto);
    res.status(r.created ? 201 : 200);
    return r.body;
  }

  @Patch('attendances/:id')
  @Header('Cache-Control', NO_STORE)
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditAttendanceDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const c = this.ctx.begin(req, res, { limit: 'edit' });
    return this.edits.edit(c.device, id, dto);
  }

  // [NV] 3.5: khieu nai trong han (ket thuc su kien + 7 ngay)
  @Post('appeals')
  @Header('Cache-Control', NO_STORE)
  async appeal(@Body() dto: CreateAppealDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const c = this.ctx.begin(req, res, { issue: true, limit: 'edit' });
    const r = await this.appeals.create(c.device, dto);
    res.status(r.created ? 201 : 200);
    return r.appeal;
  }

  @Get('me/appeals')
  @Header('Cache-Control', NO_STORE)
  myAppeals(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.appeals.mine(this.ctx.begin(req, res).device);
  }

  @Get('me/history')
  @Header('Cache-Control', NO_STORE)
  history(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const c = this.ctx.begin(req, res);
    return this.query.history(c.device);
  }
}
