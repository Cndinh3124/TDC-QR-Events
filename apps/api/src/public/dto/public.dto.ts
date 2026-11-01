// Du lieu vao cua API diem danh cong khai - dac ta 3.3, 3.4, 8.3
// [BM] chi chan hinh dang va do dai o day; MSSV theo bieu thuc trong cau hinh duoc kiem tra o service.
import { Transform } from 'class-transformer';
import {
  IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';

// gop khoang trang, bo khoang trang dau / cuoi
const clean = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : value;
// o email trong thi coi nhu khong nhap
const blankToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

// [BM] chan ky tu dieu khien va ky tu vo hinh (zero-width) trong ten
const NAME_RE = /^[^\p{Cc}\p{Cf}]+$/u;

export class CheckinDto {
  // token nam trong body (khong o URL) de khong vao nhat ky truy cap cua nginx / ALB
  @IsString() @MaxLength(64)
  token: string;

  @IsUUID('4')
  idempotencyKey: string;

  @IsString() @MaxLength(30)
  mssv: string;

  @Transform(clean) @IsString() @Length(2, 100) @Matches(NAME_RE, { message: 'Họ tên có ký tự không hợp lệ.' })
  fullName: string;

  @IsUUID()
  facultyUnitId: string;

  @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150)
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Email không hợp lệ.' })
  email?: string;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90)
  lat?: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180)
  lng?: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(100000)
  accuracyM?: number;

  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{8,128}$/)
  fingerprint?: string;
}

export class CheckoutDto {
  @IsString() @MaxLength(64)
  token: string;

  @IsUUID('4')
  idempotencyKey: string;

  // bat buoc khi su kien muc Chat (kiem tra o service)
  @IsOptional() @IsString() @Matches(/^\d{4}$/, { message: 'Mã xác nhận gồm đúng 4 chữ số.' })
  verifyCode?: string;

  // vi tri: bat buoc khi su kien co toa do (kiem tra o service, geo-rule.ts)
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90)
  lat?: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180)
  lng?: number;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(100000)
  accuracyM?: number;
}

export class EditAttendanceDto {
  @IsUUID('4')
  idempotencyKey: string;

  @IsOptional() @IsString() @MaxLength(30)
  mssv?: string;

  @IsOptional() @Transform(clean) @IsString() @Length(2, 100) @Matches(NAME_RE, { message: 'Họ tên có ký tự không hợp lệ.' })
  fullName?: string;

  @IsOptional() @IsUUID()
  facultyUnitId?: string;

  // null = xoa email
  @Transform(blankToUndefined) @ValidateIf((_, v) => v !== undefined && v !== null) @IsString() @MaxLength(150)
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Email không hợp lệ.' })
  email?: string | null;
}
