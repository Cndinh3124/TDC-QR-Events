// Tham so bao cao ĐRL - dac ta 3.6, 7 (GET /reports/drl, xuat Excel)
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginationQuery } from '../common/dto/pagination.dto';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class DrlReportQuery extends PaginationQuery {
  // theo sinh vien (mac dinh) hoac theo khoa (luon du cac khoa dang hoat dong)
  @IsOptional() @IsIn(['student', 'faculty'], { message: 'by phải là student hoặc faculty' })
  by: 'student' | 'faculty' = 'student';

  // ngay theo gio Viet Nam, tinh theo ngay bat dau su kien: from <= start_at < to + 1 ngay
  @IsOptional() @Matches(DAY, { message: 'from phải có dạng YYYY-MM-DD' })
  from?: string;

  @IsOptional() @Matches(DAY, { message: 'to phải có dạng YYYY-MM-DD' })
  to?: string;

  @IsOptional() @IsUUID()
  facultyUnitId?: string;

  @IsOptional() @IsUUID()
  eventId?: string;
}

export interface DrlStudentRow {
  mssv: string;
  fullName: string;
  faculty: string;
  eventCount: number;
  totalDrl: number;
}

export interface DrlFacultyRow {
  facultyId: string;
  faculty: string;
  studentCount: number;
  eventCount: number;
  totalDrl: number;
}
