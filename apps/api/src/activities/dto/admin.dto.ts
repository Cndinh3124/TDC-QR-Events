// DTO nam hoc, linh vuc, thong bao - dac ta quan-ly-hoat-dong 2, 3.1, 4.3
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { PaginationQuery } from '../../common/dto/pagination.dto';
import { emptyToNull, line } from '../../common/dto/transforms';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MSG = 'Ngày theo dạng YYYY-MM-DD';

export class CreateYearDto {
  @Transform(line) @IsString() @Length(4, 20, { message: 'Tên năm học từ 4 đến 20 ký tự, ví dụ 2026–2027' })
  name: string;

  @Matches(DAY, { message: DAY_MSG }) startDate: string;
  @Matches(DAY, { message: DAY_MSG }) endDate: string;

  @IsOptional() @Matches(DAY, { message: DAY_MSG }) planDeadline?: string;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) reportDeadline?: string;
}

export class UpdateYearDto {
  @IsOptional() @Transform(line) @IsString() @Length(4, 20) name?: string;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) startDate?: string;
  @IsOptional() @Matches(DAY, { message: DAY_MSG }) endDate?: string;
  // null / chuoi rong = bo han
  @IsOptional() @Transform(emptyToNull) @Matches(DAY, { message: DAY_MSG }) planDeadline?: string | null;
  @IsOptional() @Transform(emptyToNull) @Matches(DAY, { message: DAY_MSG }) reportDeadline?: string | null;
}

export class CreateCategoryDto {
  @Transform(line) @IsString() @Length(2, 100, { message: 'Tên lĩnh vực từ 2 đến 100 ký tự' })
  name: string;

  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @Transform(line) @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class NotificationQuery extends PaginationQuery {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() unread?: boolean;
}
