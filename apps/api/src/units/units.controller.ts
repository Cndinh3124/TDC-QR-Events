// /api/admin/units - xem theo pham vi; them/sua/khoa/xoa chi QTV truong
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { PaginationQuery } from '../common/dto/pagination.dto';
import { CreateUnitDto, ReasonDto, UpdateUnitDto } from './dto/unit.dto';
import { UnitsService } from './units.service';

@Controller('admin/units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  list(@CurrentUser() u: CurrentUserType, @Query() q: PaginationQuery) {
    return this.units.list(u, q);
  }

  @Get(':id')
  get(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.units.get(u, id);
  }

  @Roles('SCHOOL_ADMIN')
  @Post()
  create(@CurrentUser() u: CurrentUserType, @Body() dto: CreateUnitDto) {
    return this.units.create(u, dto);
  }

  @Roles('SCHOOL_ADMIN')
  @Patch(':id')
  update(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    return this.units.update(u, id, dto);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.units.setActive(u, id, false, dto.reason);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':id/activate')
  @HttpCode(200)
  activate(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.units.setActive(u, id, true, dto.reason);
  }

  @Roles('SCHOOL_ADMIN')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.units.remove(u, id, dto.reason);
  }
}
