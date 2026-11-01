// /api/admin/students - pham vi theo khoa kiem tra o service; gop MSSV chi Doan truong
import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { CurrentUser, Roles } from '../common/decorators';
import { MergeStudentDto, StudentListQuery, UpdateStudentDto } from './students.dto';
import { StudentsService } from './students.service';

const MSSV_PARAM = /^[A-Za-z0-9]{1,20}$/;

@Controller('admin/students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Header('Cache-Control', 'no-store')
  @Get()
  list(@CurrentUser() u: CurrentUserType, @Query() q: StudentListQuery) {
    return this.students.list(u, q);
  }

  @Header('Cache-Control', 'no-store')
  @Get(':mssv')
  get(@CurrentUser() u: CurrentUserType, @Param('mssv') mssv: string) {
    return this.students.get(u, norm(mssv));
  }

  @Patch(':mssv')
  update(@CurrentUser() u: CurrentUserType, @Param('mssv') mssv: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(u, norm(mssv), dto);
  }

  @Roles('SCHOOL_ADMIN')
  @Post(':mssv/merge') @HttpCode(200)
  merge(@CurrentUser() u: CurrentUserType, @Param('mssv') mssv: string, @Body() dto: MergeStudentDto) {
    return this.students.merge(u, norm(mssv), dto);
  }
}

// MSSV tren duong dan: chi chu + so, viet hoa; sai hinh dang thi coi nhu khong ton tai
function norm(raw: string): string {
  const v = raw.trim().toUpperCase();
  return MSSV_PARAM.test(v) ? v : '__invalid__';
}
