// /api/admin/activities - ca hai vai tro; phan duyet / danh gia chi Doan truong (@Roles + kiem tra lai o service)
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { CurrentUser, Roles } from '../common/decorators';
import { ReasonDto } from '../common/dto/reason.dto';
import { ActivitiesService } from './activities.service';
import { ActivityWorkflowService } from './activity-workflow.service';
import {
  ActivityListQuery, BulkApproveDto, BulkEvaluateDto, CommentDto, CreateActivityDto, EvaluateDto, LinkEventDto, NoteDto, RewardDto, UpdateActivityDto,
} from './dto/activity.dto';

@Controller('admin/activities')
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService, private readonly flow: ActivityWorkflowService) {}

  @Get()
  list(@CurrentUser() u: CurrentUserType, @Query() q: ActivityListQuery) {
    return this.svc.list(u, q);
  }

  // hang loat: duong dan tinh dat truoc ":id"
  @Roles('SCHOOL_ADMIN')
  @Post('bulk/approve') @HttpCode(200)
  bulkApprove(@CurrentUser() u: CurrentUserType, @Body() dto: BulkApproveDto) {
    return this.flow.bulkApprove(u, dto.ids);
  }

  @Roles('SCHOOL_ADMIN')
  @Post('bulk/evaluate') @HttpCode(200)
  bulkEvaluate(@CurrentUser() u: CurrentUserType, @Body() dto: BulkEvaluateDto) {
    return this.flow.bulkEvaluate(u, dto);
  }

  @Get(':id')
  get(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(u, id);
  }

  @Get(':id/timeline')
  timeline(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.timeline(u, id);
  }

  @Get(':id/versions')
  versions(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.versions(u, id);
  }

  @Get(':id/checklist')
  checklist(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.checklist(u, id);
  }

  @Get(':id/comments')
  comments(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.comments(u, id);
  }

  @Post(':id/comments')
  addComment(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommentDto) {
    return this.svc.addComment(u, id, dto);
  }

  @Post()
  create(@CurrentUser() u: CurrentUserType, @Body() dto: CreateActivityDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActivityDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id') @HttpCode(204)
  async remove(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.svc.remove(u, id, dto.reason);
  }

  // ---- gan buoi diem danh ----

  @Post(':id/events') @HttpCode(200)
  linkEvent(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkEventDto) {
    return this.svc.linkEvent(u, id, dto.eventId);
  }

  @Delete(':id/events/:eventId')
  unlinkEvent(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.svc.unlinkEvent(u, id, eventId);
  }

  // ---- quy trinh ----

  @Post(':id/submit') @HttpCode(200)
  submit(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.flow.submit(u, id);
  }

  @Post(':id/submit-result') @HttpCode(200)
  submitResult(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.flow.submitResult(u, id);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/approve') @HttpCode(200)
  approve(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.flow.approve(u, id);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/return') @HttpCode(200)
  returnBack(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.flow.returnBack(u, id, dto.note);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/evaluate') @HttpCode(200)
  evaluate(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EvaluateDto) {
    return this.flow.evaluate(u, id, dto);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/reward') @HttpCode(200)
  reward(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RewardDto) {
    return this.flow.reward(u, id, dto);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/reopen') @HttpCode(200)
  reopen(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.flow.reopen(u, id, dto.reason);
  }
}
