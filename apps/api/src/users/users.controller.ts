// /api/admin/users - chi QTV Doan truong (dac ta 7)
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { ReasonDto } from '../units/dto/unit.dto';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UserListQuery } from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('admin/users')
@Roles('SCHOOL_ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() q: UserListQuery) {
    return this.users.list(q);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  create(@CurrentUser() u: CurrentUserType, @Body() dto: CreateUserDto) {
    return this.users.create(u, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(u, id, dto);
  }

  @Post(':id/lock')
  @HttpCode(200)
  lock(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.users.lock(u, id, dto.reason);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  unlock(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.users.unlock(u, id, dto.reason);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  reset(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(u, id, dto.newPassword);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() u: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    await this.users.remove(u, id, dto.reason);
  }
}
