import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQuery } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowerTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const ROLES = ['SCHOOL_ADMIN', 'FACULTY_MANAGER'];

export class CreateUserDto {
  @Transform(lowerTrim) @IsEmail({}, { message: 'Email không hợp lệ' }) @MaxLength(190)
  email: string;

  @Transform(trim) @IsString() @Length(2, 120, { message: 'Họ tên từ 2 đến 120 ký tự' })
  fullName: string;

  @IsIn(ROLES, { message: 'Vai trò không hợp lệ' })
  role: 'SCHOOL_ADMIN' | 'FACULTY_MANAGER';

  @IsUUID(undefined, { message: 'Đơn vị không hợp lệ' })
  unitId: string;

  // mat khau ban dau do QTV dat, nguoi dung bi buoc doi o lan dang nhap dau
  @IsString() @MaxLength(128)
  password: string;
}

export class UpdateUserDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 120, { message: 'Họ tên từ 2 đến 120 ký tự' })
  fullName?: string;

  @IsOptional() @IsIn(ROLES, { message: 'Vai trò không hợp lệ' })
  role?: 'SCHOOL_ADMIN' | 'FACULTY_MANAGER';

  @IsOptional() @IsUUID(undefined, { message: 'Đơn vị không hợp lệ' })
  unitId?: string;
}

export class ResetPasswordDto {
  @IsString() @MaxLength(128)
  newPassword: string;
}

export class UserListQuery extends PaginationQuery {
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => String) @IsIn(['active', 'locked']) status?: 'active' | 'locked';
}
