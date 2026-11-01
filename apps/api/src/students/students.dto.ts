// DTO quan ly ho so sinh vien - dac ta 3.7, 7 (GET /students, PATCH /students/:mssv, POST /students/:mssv/merge)
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { PaginationQuery } from '../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value);
const REASON_MSG = 'Vui lòng nhập lý do (ít nhất 3 ký tự)';

export class StudentListQuery extends PaginationQuery {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsUUID()
  facultyUnitId?: string;
}

export class UpdateStudentDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : value))
  @IsString() @Length(2, 100)
  fullName?: string;

  @IsOptional() @IsUUID()
  facultyUnitId?: string;

  @Transform(trim) @IsString() @Length(3, 500, { message: REASON_MSG })
  reason: string;
}

export class MergeStudentDto {
  // MSSV giu lai; hinh dang kiem tra tai service theo cau hinh mssv_regex
  @Transform(upper) @IsString() @Matches(/^[A-Z0-9]{1,20}$/, { message: 'MSSV đích không hợp lệ' })
  intoMssv: string;

  @Transform(trim) @IsString() @Length(3, 500, { message: REASON_MSG })
  reason: string;
}

export interface StudentDto {
  mssv: string;
  fullName: string;
  faculty: { id: string; name: string } | null;
  firstSeenAt: Date;
  mergedInto: string | null;
  attendanceCount: number;
  totalDrl: number;
}

export interface StudentHistoryItem {
  attendanceId: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: Date;
  checkinAt: Date;
  reviewStatus: string;
  drlAwarded: number | null;
  voided: boolean;
}
