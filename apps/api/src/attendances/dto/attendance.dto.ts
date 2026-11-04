// DTO vao / ra cua man duyet luot diem danh - dac ta 3.6, 3.7, 7
// [BM] du lieu ra chi qua toAttendanceDto: khong co ip, user_agent goc, toa do, ma thiet bi day du.
// Chi co nhan rut gon `client` ("Chrome 126 · Android 14") do describeClient() doc tu user-agent.
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDate, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength,
  ValidateIf,
} from 'class-validator';
import { describeClient } from '../../common/client-info';
import { PaginationQuery } from '../../common/dto/pagination.dto';
import { Attendance, ReviewStatus } from '../../public/entities/attendance.entity';
import { AttendanceFlag } from '../../public/entities/attendance-flag.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// dung chung ISO 8601 co mui gio nhu DTO su kien
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const isoDate = ({ value }: { value: unknown }) =>
  typeof value === 'string' && ISO_WITH_ZONE.test(value) ? new Date(value) : value;
const DATE_MSG = 'Thời gian phải theo dạng ISO 8601 kèm múi giờ, ví dụ 2026-11-05T08:00:00+07:00';
const REASON_MSG = 'Vui lòng nhập lý do (ít nhất 3 ký tự)';

export const MAX_BULK = 500;

export class AttendanceListQuery extends PaginationQuery {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED'], { message: 'review không hợp lệ' })
  review?: ReviewStatus;

  // exclude (mac dinh) = an luot da huy; include = lan ca; only = chi luot da huy
  @IsOptional() @IsIn(['exclude', 'include', 'only'], { message: 'voided không hợp lệ' })
  voided: 'exclude' | 'include' | 'only' = 'exclude';

  // yes = co it nhat mot co; no = sach
  @IsOptional() @IsIn(['yes', 'no'], { message: 'flagged không hợp lệ' })
  flagged?: 'yes' | 'no';

  @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  flag?: string;

  @IsOptional() @IsIn(['SELF', 'MANUAL'], { message: 'source không hợp lệ' })
  source?: 'SELF' | 'MANUAL';

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  q?: string;
}

export class ReviewDto {
  @IsIn(['APPROVED', 'REJECTED', 'PENDING'], { message: 'status phải là APPROVED, REJECTED hoặc PENDING' })
  status: ReviewStatus;

  // bat buoc khi tu choi (kiem tra o service)
  @IsOptional() @Transform(trim) @IsString() @Length(3, 500, { message: REASON_MSG })
  reason?: string;
}

export class BulkDto {
  @IsUUID() eventId: string;

  @IsIn(['APPROVE', 'REJECT', 'VOID', 'APPROVE_CLEAN'], { message: 'action không hợp lệ' })
  action: 'APPROVE' | 'REJECT' | 'VOID' | 'APPROVE_CLEAN';

  // APPROVE_CLEAN khong can ids: duyet moi luot cho duyet va khong co
  @ValidateIf((o: BulkDto) => o.action !== 'APPROVE_CLEAN')
  @IsArray() @ArrayMinSize(1, { message: 'Chọn ít nhất một lượt' }) @ArrayMaxSize(MAX_BULK, { message: `Tối đa ${MAX_BULK} lượt mỗi lần` })
  @ArrayUnique() @IsUUID('4', { each: true, message: 'Mã lượt không hợp lệ' })
  ids?: string[];

  @IsOptional() @Transform(trim) @IsString() @Length(3, 500, { message: REASON_MSG })
  reason?: string;
}

// cac truong cua mot luot them thu cong (dung chung voi xu ly khieu nai)
export class ManualFieldsDto {
  @Transform(trim) @IsString() @MaxLength(30)
  mssv: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : value))
  @IsString() @Length(2, 100)
  fullName: string;

  @IsUUID()
  facultyUnitId: string;

  @IsOptional() @Transform(({ value }) => (value === '' ? undefined : value)) @IsEmail({}, { message: 'Email không hợp lệ' }) @MaxLength(150)
  email?: string;

  // bo trong: lay gio bat dau su kien (trong khung hop le); checkout chi nhan khi su kien co diem danh ra
  @IsOptional() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  checkinAt?: Date;

  @IsOptional() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  checkoutAt?: Date;
}

export class ManualAttendanceDto extends ManualFieldsDto {
  @Transform(trim) @IsString() @Length(3, 500, { message: REASON_MSG })
  reason: string;
}

export class EditAttendanceAdminDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) mssv?: string;

  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : value))
  @IsString() @Length(2, 100)
  fullName?: string;

  @IsOptional() @IsUUID() facultyUnitId?: string;

  // null = xoa email
  @ValidateIf((_o, v) => v !== undefined && v !== null) @IsEmail({}, { message: 'Email không hợp lệ' }) @MaxLength(150)
  email?: string | null;

  @IsOptional() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  checkinAt?: Date;

  // null = xoa gio ra
  @ValidateIf((_o, v) => v !== undefined && v !== null) @Transform(isoDate) @IsDate({ message: DATE_MSG })
  checkoutAt?: Date | null;

  @Transform(trim) @IsString() @Length(3, 500, { message: REASON_MSG })
  reason: string;
}

export interface AttendanceDto {
  id: string;
  mssv: string;
  fullName: string;
  email: string | null;
  faculty: { id: string; name: string } | null;
  checkinAt: Date;
  checkoutAt: Date | null;
  timeliness: 'ON_TIME' | 'LATE';
  source: 'SELF' | 'MANUAL';
  reviewStatus: ReviewStatus;
  reviewedAt: Date | null;
  reviewNote: string | null;
  drlAwarded: number | null;
  // null voi nguoi chi-xem (khoa xem su kien cap truong): ma xac nhan dung khi khieu nai
  confirmCode: string | null;
  editCount: number;
  distanceM: number | null;
  // 8 ky tu dau cua ma thiet bi: du de nhin ra "cung thiet bi", khong du de dung lai
  deviceRef: string | null;
  // trinh duyet + he dieu hanh, vd "Chrome 126 · Android 14"; null voi luot them thu cong hoac da qua han luu tru
  client: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  flags: Array<{ code: string; detail: Record<string, unknown> | null }>;
}

export function toAttendanceDto(a: Attendance, flags: AttendanceFlag[], showCode: boolean): AttendanceDto {
  return {
    id: a.id,
    mssv: a.mssv,
    fullName: a.fullName,
    email: a.email,
    faculty: a.faculty ? { id: a.faculty.id, name: a.faculty.name } : null,
    checkinAt: a.checkinAt,
    checkoutAt: a.checkoutAt,
    timeliness: a.timeliness,
    source: a.source,
    reviewStatus: a.reviewStatus,
    reviewedAt: a.reviewedAt,
    reviewNote: a.reviewNote,
    drlAwarded: a.drlAwarded,
    confirmCode: showCode ? a.confirmCode : null,
    editCount: a.editCount,
    distanceM: a.distanceM,
    deviceRef: a.deviceId ? a.deviceId.slice(0, 8) : null,
    client: describeClient(a.userAgent),
    voidedAt: a.voidedAt,
    voidReason: a.voidReason,
    flags: flags.map((f) => ({ code: f.code, detail: f.detailJson })),
  };
}

// [NV] A07: ngan keo chi tiet mot luot - lich su sua va cac su kien khac cua cung MSSV
export interface AttendanceChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface AttendanceEditItem {
  at: Date;
  actorType: 'STUDENT' | 'ADMIN';
  // ten quan tri; sinh vien tu sua thi null (khong lo ma thiet bi)
  actorName: string | null;
  reason: string | null;
  changes: AttendanceChange[];
}

export interface OtherAttendanceItem {
  attendanceId: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: Date;
  checkinAt: Date;
  mssv: string; // khac MSSV dang xem khi la MSSV da gop
  reviewStatus: ReviewStatus;
  voided: boolean;
  drlAwarded: number | null;
}

export interface AttendanceDetail {
  attendance: AttendanceDto;
  edits: AttendanceEditItem[];
  otherAttendances: OtherAttendanceItem[];
}

// truong an toan de ghi nhat ky / lich su sua
export function attendanceAuditView(a: Attendance) {
  return {
    mssv: a.mssv, fullName: a.fullName, email: a.email, facultyUnitId: a.facultyUnitId,
    checkinAt: a.checkinAt, checkoutAt: a.checkoutAt, reviewStatus: a.reviewStatus, voidedAt: a.voidedAt,
  };
}
