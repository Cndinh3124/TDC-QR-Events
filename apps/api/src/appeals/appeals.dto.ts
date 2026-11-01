// DTO quan tri khieu nai - dac ta 3.5, 7 (GET /appeals, PATCH /appeals/:id)
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';
import { ManualFieldsDto } from '../attendances/dto/attendance.dto';
import { PaginationQuery } from '../common/dto/pagination.dto';
import { Appeal, AppealStatus, AppealType } from './appeal.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AppealListQuery extends PaginationQuery {
  @IsOptional() @IsIn(['PENDING', 'ACCEPTED', 'REJECTED'], { message: 'status không hợp lệ' })
  status?: AppealStatus;

  @IsOptional() @IsUUID()
  eventId?: string;
}

export class HandleAppealDto {
  @IsIn(['ACCEPT', 'REJECT'], { message: 'action phải là ACCEPT hoặc REJECT' })
  action: 'ACCEPT' | 'REJECT';

  // ghi chu / ly do bat buoc ca khi chap nhan va tu choi
  @Transform(trim) @IsString() @Length(3, 500, { message: 'Vui lòng nhập ghi chú xử lý (ít nhất 3 ký tự)' })
  note: string;

  // chap nhan: duyet luot da co (khoi phuc neu dang huy) ...
  @IsOptional() @IsBoolean()
  approveAttendance?: boolean;

  // ... hoac tao luot moi khi sinh vien khong diem danh duoc
  @IsOptional() @ValidateNested() @Type(() => ManualFieldsDto)
  attendance?: ManualFieldsDto;
}

export interface AppealDto {
  id: string;
  event: { id: string; title: string };
  attendanceId: string | null;
  mssv: string;
  fullName: string | null;
  type: AppealType;
  content: string;
  status: AppealStatus;
  deadlineAt: Date;
  handledAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
}

export function toAppealDto(a: Appeal, event: { id: string; title: string }): AppealDto {
  return {
    id: a.id, event, attendanceId: a.attendanceId, mssv: a.mssv, fullName: a.fullName, type: a.type, content: a.content,
    status: a.status, deadlineAt: a.deadlineAt, handledAt: a.handledAt, resolutionNote: a.resolutionNote, createdAt: a.createdAt,
  };
}
