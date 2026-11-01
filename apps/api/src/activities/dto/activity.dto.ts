// DTO vao / ra cua hoat dong - dac ta quan-ly-hoat-dong 3, 4. [BM] du lieu ra chi qua toActivityDto.
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDate, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { DATE_MSG, emptyToNull, isoDate, line, text } from '../../common/dto/transforms';
import { PaginationQuery } from '../../common/dto/pagination.dto';
import { Activity, ActivityLevel, ActivityMode, ActivityStatus, Evaluation, Reward } from '../entities/activity.entity';
import { ActivityLink, LinkGroup, LinkType } from '../entities/activity-parts.entity';

const LEVELS = ['SCHOOL', 'FACULTY', 'CLASS'];
const MODES = ['ONSITE', 'ONLINE', 'HYBRID'];
const GROUPS = ['MEDIA', 'PUBLICATION', 'RESULT'];
const LINK_TYPES = ['FACEBOOK', 'VIDEO', 'PHOTO', 'INFOGRAPHIC', 'NEWS', 'OTHER'];
const STATUSES = ['DRAFT', 'PENDING_PLAN', 'IN_PROGRESS', 'PENDING_EVAL', 'EVALUATED', 'LOCKED'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class LinkInputDto {
  @IsIn(GROUPS, { message: 'Nhóm link không hợp lệ' })
  group: LinkGroup;

  @IsOptional() @IsIn(LINK_TYPES, { message: 'Loại link không hợp lệ' })
  type?: LinkType;

  @Transform(line) @IsString() @Length(1, 2048, { message: 'Đường dẫn tối đa 2048 ký tự' })
  url: string;

  @IsOptional() @Matches(DAY, { message: 'Ngày đăng theo dạng YYYY-MM-DD' })
  publishedOn?: string;
}

export class CreateActivityDto {
  @IsUUID(undefined, { message: 'Năm học không hợp lệ' })
  academicYearId: string;

  // bo trong: don vi cua nguoi tao
  @IsOptional() @IsUUID(undefined, { message: 'Đơn vị không hợp lệ' })
  unitId?: string;

  @IsOptional() @IsUUID(undefined, { message: 'Lĩnh vực không hợp lệ' })
  categoryId?: string;

  @IsOptional() @IsIn(LEVELS, { message: 'Cấp hoạt động không hợp lệ' })
  level?: ActivityLevel;

  @Transform(line) @IsString() @Length(3, 255, { message: 'Tên hoạt động từ 3 đến 255 ký tự' })
  name: string;

  @Transform(isoDate) @IsDate({ message: DATE_MSG })
  startAt: Date;

  @Transform(isoDate) @IsDate({ message: DATE_MSG })
  endAt: Date;

  @IsOptional() @Transform(line) @IsString() @MaxLength(255)
  location?: string;

  @IsOptional() @IsIn(MODES, { message: 'Hình thức không hợp lệ' })
  mode?: ActivityMode;

  @IsOptional() @Transform(line) @IsString() @MaxLength(255)
  targetAudience?: string;

  @IsOptional() @IsInt({ message: 'Số người dự kiến phải là số nguyên' }) @Min(0) @Max(1_000_000)
  expectedCount?: number;

  @IsOptional() @IsInt({ message: 'Số người tham gia phải là số nguyên' }) @Min(0) @Max(1_000_000)
  manualCount?: number;

  @IsOptional() @IsInt({ message: 'Kinh phí phải là số nguyên (đồng)' }) @Min(0) @Max(100_000_000_000)
  budgetPlanned?: number;

  @IsOptional() @IsInt({ message: 'Kinh phí phải là số nguyên (đồng)' }) @Min(0) @Max(100_000_000_000)
  budgetActual?: number;

  @IsOptional() @Transform(line) @IsString() @MaxLength(120)
  ownerName?: string;

  @IsOptional() @Matches(/^[0-9+().\s-]{6,20}$/, { message: 'Số điện thoại không hợp lệ' })
  ownerPhone?: string;

  @IsOptional() @Transform(line) @IsString() @MaxLength(2048)
  planUrl?: string;

  @IsOptional() @Transform(text) @IsString() @MaxLength(1000)
  note?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID(undefined, { each: true, message: 'Đơn vị phối hợp không hợp lệ' })
  coUnitIds?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(15, { message: 'Tối đa 15 đường dẫn' }) @ValidateNested({ each: true }) @Type(() => LinkInputDto)
  links?: LinkInputDto[];
}

// Sua mot phan. null / chuoi rong = xoa gia tri (chi voi truong tuy chon). links, coUnitIds thay the toan bo danh sach.
export class UpdateActivityDto {
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsIn(LEVELS) level?: ActivityLevel;
  @IsOptional() @Transform(line) @IsString() @Length(3, 255, { message: 'Tên hoạt động từ 3 đến 255 ký tự' }) name?: string;
  @IsOptional() @Transform(isoDate) @IsDate({ message: DATE_MSG }) startAt?: Date;
  @IsOptional() @Transform(isoDate) @IsDate({ message: DATE_MSG }) endAt?: Date;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_o, v) => v !== null) @Transform(line) @IsString() @MaxLength(255) location?: string | null;
  @IsOptional() @IsIn(MODES) mode?: ActivityMode;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_o, v) => v !== null) @Transform(line) @IsString() @MaxLength(255) targetAudience?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(1_000_000) expectedCount?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(1_000_000) manualCount?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(100_000_000_000) budgetPlanned?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(100_000_000_000) budgetActual?: number | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_o, v) => v !== null) @Transform(line) @IsString() @MaxLength(120) ownerName?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_o, v) => v !== null) @Matches(/^[0-9+().\s-]{6,20}$/, { message: 'Số điện thoại không hợp lệ' }) ownerPhone?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_o, v) => v !== null) @Transform(line) @IsString() @MaxLength(2048) planUrl?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_o, v) => v !== null) @Transform(text) @IsString() @MaxLength(1000) note?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID(undefined, { each: true }) coUnitIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(15, { message: 'Tối đa 15 đường dẫn' }) @ValidateNested({ each: true }) @Type(() => LinkInputDto) links?: LinkInputDto[];
}

export class ActivityListQuery extends PaginationQuery {
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsIn(STATUSES) status?: ActivityStatus;
  @IsOptional() @IsIn(['COMPLETED', 'NOT_COMPLETED', 'NONE']) evaluation?: Evaluation | 'NONE';
  @IsOptional() @IsIn(['APPROVED', 'REJECTED', 'NONE']) reward?: Reward | 'NONE';
  @IsOptional() @Transform(line) @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Date) @IsDate({ message: 'from phải là ngày hợp lệ' }) from?: Date;
  @IsOptional() @Type(() => Date) @IsDate({ message: 'to phải là ngày hợp lệ' }) to?: Date;
  // chi hoat dong chua co link san pham truyen thong nao
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() missingMedia?: boolean;
}

export class NoteDto {
  @Transform(text) @IsString() @Length(3, 1000, { message: 'Vui lòng nhập nội dung (ít nhất 3 ký tự)' })
  note: string;
}

export class EvaluateDto {
  @IsIn(['COMPLETED', 'NOT_COMPLETED'], { message: 'Kết quả đánh giá không hợp lệ' })
  result: Evaluation;

  // bat buoc khi "Chua hoan thanh" (kiem tra o service)
  @IsOptional() @Transform(text) @IsString() @MaxLength(1000)
  note?: string;
}

export class RewardDto {
  @IsIn(['APPROVED', 'REJECTED'], { message: 'Quyết định khen thưởng không hợp lệ' })
  result: Reward;

  @IsOptional() @Transform(text) @IsString() @MaxLength(1000)
  note?: string;
}

export class BulkApproveDto {
  @IsArray() @ArrayMaxSize(100, { message: 'Tối đa 100 hồ sơ mỗi lần' }) @ArrayUnique() @IsUUID(undefined, { each: true })
  ids: string[];
}

export class BulkEvaluateDto extends BulkApproveDto {
  @IsIn(['COMPLETED', 'NOT_COMPLETED']) result: Evaluation;
  @IsOptional() @Transform(text) @IsString() @MaxLength(1000) note?: string;
}

export class CommentDto {
  @Transform(text) @IsString() @Length(1, 2000, { message: 'Nội dung tối đa 2000 ký tự' })
  content: string;
}

export class LinkEventDto {
  @IsUUID(undefined, { message: 'Sự kiện không hợp lệ' })
  eventId: string;
}

// ---------------- dau ra ----------------

export interface ActivityLinkDto { id: string; group: LinkGroup; type: LinkType; url: string; publishedOn: string | null; needsReview: boolean }

export interface ActivityDto {
  id: string; code: string;
  academicYear: { id: string; name: string } | null;
  unit: { id: string; name: string; code: string } | null;
  category: { id: string; name: string } | null;
  level: ActivityLevel; name: string; startAt: Date; endAt: Date;
  location: string | null; mode: ActivityMode; targetAudience: string | null;
  expectedCount: number | null;
  // co buoi diem danh gan kem thi tu dong, khong thi nhap tay (manualCount)
  actualCount: number | null; actualSource: 'ATTENDANCE' | 'MANUAL' | null; manualCount: number | null;
  budgetPlanned: number | null; budgetActual: number | null;
  ownerName: string | null; ownerPhone: string | null; planUrl: string | null; note: string | null;
  status: ActivityStatus; returnNote: string | null; returnedAt: Date | null; submittedAt: Date | null;
  evaluation: Evaluation | null; evaluationNote: string | null; evaluatedAt: Date | null;
  reward: Reward | null; rewardNote: string | null; lockedAt: Date | null;
  counts: { media: number; publication: number; result: number };
  coUnits: Array<{ id: string; name: string }>;
  links?: ActivityLinkDto[];
  events?: Array<{ id: string; title: string; startAt: Date; attendanceCount: number }>;
  // giao dien an nut theo hai co nay; backend van kiem tra lai
  canEdit: boolean; canSubmit: boolean; canReview: boolean;
  createdBy: string; createdAt: Date; updatedAt: Date;
}

export interface DtoExtras {
  counts: { media: number; publication: number; result: number };
  attendance: number | null; // so MSSV khac nhau tu cac buoi diem danh gan kem; null = khong co buoi nao
  coUnits: Array<{ id: string; name: string }>;
  links?: ActivityLink[];
  events?: ActivityDto['events'];
  canEdit: boolean; canSubmit: boolean; canReview: boolean;
}

const num = (v: string | null) => (v === null ? null : Number(v));

export function toActivityDto(a: Activity, x: DtoExtras): ActivityDto {
  const useAttendance = x.attendance !== null;
  return {
    id: a.id, code: a.code,
    academicYear: a.academicYear ? { id: a.academicYear.id, name: a.academicYear.name } : null,
    unit: a.unit ? { id: a.unit.id, name: a.unit.name, code: a.unit.code } : null,
    category: a.category ? { id: a.category.id, name: a.category.name } : null,
    level: a.level, name: a.name, startAt: a.startAt, endAt: a.endAt,
    location: a.location, mode: a.mode, targetAudience: a.targetAudience, expectedCount: a.expectedCount,
    actualCount: useAttendance ? x.attendance : a.manualCount,
    actualSource: useAttendance ? 'ATTENDANCE' : a.manualCount !== null ? 'MANUAL' : null,
    manualCount: a.manualCount,
    budgetPlanned: num(a.budgetPlanned), budgetActual: num(a.budgetActual),
    ownerName: a.ownerName, ownerPhone: a.ownerPhone, planUrl: a.planUrl, note: a.note,
    status: a.status, returnNote: a.returnNote, returnedAt: a.returnedAt, submittedAt: a.submittedAt,
    evaluation: a.evaluation, evaluationNote: a.evaluationNote, evaluatedAt: a.evaluatedAt,
    reward: a.reward, rewardNote: a.rewardNote, lockedAt: a.lockedAt,
    counts: x.counts, coUnits: x.coUnits,
    links: x.links?.map((l) => ({ id: l.id, group: l.group, type: l.type, url: l.url, publishedOn: l.publishedOn, needsReview: l.needsReview })),
    events: x.events,
    canEdit: x.canEdit, canSubmit: x.canSubmit, canReview: x.canReview,
    createdBy: a.createdBy, createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}
