// /api/admin/appeals - quyen va pham vi kiem tra o service
import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { CurrentUser } from '../common/decorators';
import { AppealListQuery, HandleAppealDto } from './appeals.dto';
import { AppealsService } from './appeals.service';

@Controller('admin/appeals')
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Header('Cache-Control', 'no-store')
  @Get()
  list(@CurrentUser() u: CurrentUserType, @Query() q: AppealListQuery) {
    return this.appeals.list(u, q);
  }

  @Patch(':id')
  handle(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HandleAppealDto) {
    return this.appeals.handle(u, id, dto);
  }
}
