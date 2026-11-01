// DTO vao / ra cua su kien - dac ta 3.1, 7, 8.3
// [BM] du lieu ra chi qua toEventDto (khong tra entity tho: tranh lo verify_code_hash).
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDate, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../common/dto/pagination.dto';
import { checkinState, CheckinState } from '../event-rules';
import { ControlLevel, Event, EventStatus, FacultyViewMode } from '../entities/event.entity';

// chuoi mot dong: bo ky tu dieu khien (\p{Cc}), gom khoang trang - dac ta 8.3
const line = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim() : value;
// van ban nhieu dong: chi giu xuong dong, bo ky tu dieu khien khac
const text = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/(?![\t\n\r])\p{Cc}/gu, '').trim() : value;
// [BM] bat buoc ISO 8601 co mui gio, de gio khong bi hieu lech giua may chu va nguoi dung
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const isoDate = ({ value }: { value: unknown }) =>
  typeof value === 'string' && ISO_WITH_ZONE.test(value) ? new Date(value) : value;
// co the bo trong nhung KHONG duoc gui null (khac IsOptional: cai do bo qua ca null)
const OptionalNotNull = () => ValidateIf((_o, v) => v !== undefined);
const DATE_MSG = 'Thời gian phải theo dạng ISO 8601 kèm múi giờ, ví dụ 2026-11-05T08:00:00+07:00';

export class CreateEventDto {
  // bo trong: lay don vi cua nguoi tao (quan ly khoa); QTV truong bat buoc chon
  @IsOptional() @IsUUID(undefined, { message: 'Đơn vị không hợp lệ' })
  unitId?: string;

  @Transform(line) @IsString() @Length(3, 200, { message: 'Tên sự kiện từ 3 đến 200 ký tự' })
  title: string;

  @IsOptional() @Transform(text) @IsString() @MaxLength(2000, { message: 'Mô tả tối đa 2000 ký tự' })
  description?: string;

  @IsOptional() @Transform(line) @IsString() @MaxLength(200, { message: 'Địa điểm tối đa 200 ký tự' })
  locationName?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Vĩ độ không hợp lệ' }) @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Kinh độ không hợp lệ' }) @Min(-180) @Max(180)
  longitude?: number;

  @IsOptional() @IsInt({ message: 'Bán kính phải là số nguyên (mét)' }) @Min(10, { message: 'Bán kính từ 10 đến 5000 m' }) @Max(5000, { message: 'Bán kính từ 10 đến 5000 m' })
  radiusM?: number;

  @Transform(isoDate) @IsDate({ message: DATE_MSG })
  startAt: Date;

  @Transform(isoDate) @IsDate({ message: DATE_MSG })
  endAt: Date;

  // bo trong: lay theo cau hinh (mo truoc N phut, dong luc ket thuc)
  @IsOptional() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  checkinOpenAt?: Date;

  @IsOptional() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  checkinCloseAt?: Date;

  @IsOptional() @IsInt({ message: 'Thời gian ân hạn phải là số nguyên (phút)' }) @Min(0) @Max(120, { message: 'Ân hạn tối đa 120 phút' })
  graceMinutes?: number;

  @IsBoolean({ message: 'Cần cho biết sự kiện có cộng điểm rèn luyện hay không' })
  hasDrl: boolean;

  @IsOptional() @IsInt({ message: 'Điểm rèn luyện phải là số nguyên từ 1 đến 10' }) @Min(1, { message: 'Điểm rèn luyện từ 1 đến 10' }) @Max(10, { message: 'Điểm rèn luyện từ 1 đến 10' })
  drlPoints?: number;

  // bo trong: DRL >= 5 thi de xuat Chat - dac ta 5.2
  @IsOptional() @IsIn(['NORMAL', 'TIGHT'], { message: 'Mức kiểm soát không hợp lệ' })
  controlLevel?: ControlLevel;

  @IsOptional() @IsBoolean()
  requireCheckout?: boolean;
}

// Sua mot phan. null = xoa gia tri (chi ap dung cho mo ta, dia diem, toa do).
export class UpdateEventDto {
  @OptionalNotNull() @Transform(line) @IsString() @Length(3, 200, { message: 'Tên sự kiện từ 3 đến 200 ký tự' })
  title?: string;

  @IsOptional() @Transform(text) @IsString() @MaxLength(2000, { message: 'Mô tả tối đa 2000 ký tự' })
  description?: string | null;

  @IsOptional() @Transform(line) @IsString() @MaxLength(200, { message: 'Địa điểm tối đa 200 ký tự' })
  locationName?: string | null;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Vĩ độ không hợp lệ' }) @Min(-90) @Max(90)
  latitude?: number | null;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Kinh độ không hợp lệ' }) @Min(-180) @Max(180)
  longitude?: number | null;

  @IsOptional() @IsInt({ message: 'Bán kính phải là số nguyên (mét)' }) @Min(10, { message: 'Bán kính từ 10 đến 5000 m' }) @Max(5000, { message: 'Bán kính từ 10 đến 5000 m' })
  radiusM?: number | null;

  @OptionalNotNull() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  startAt?: Date;

  @OptionalNotNull() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  endAt?: Date;

  @OptionalNotNull() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  checkinOpenAt?: Date;

  @OptionalNotNull() @Transform(isoDate) @IsDate({ message: DATE_MSG })
  checkinCloseAt?: Date;

  @OptionalNotNull() @IsInt({ message: 'Thời gian ân hạn phải là số nguyên (phút)' }) @Min(0) @Max(120, { message: 'Ân hạn tối đa 120 phút' })
  graceMinutes?: number;

  @OptionalNotNull() @IsBoolean()
  hasDrl?: boolean;

  @IsOptional() @IsInt({ message: 'Điểm rèn luyện phải là số nguyên từ 1 đến 10' }) @Min(1, { message: 'Điểm rèn luyện từ 1 đến 10' }) @Max(10, { message: 'Điểm rèn luyện từ 1 đến 10' })
  drlPoints?: number | null;

  @OptionalNotNull() @IsIn(['NORMAL', 'TIGHT'], { message: 'Mức kiểm soát không hợp lệ' })
  controlLevel?: ControlLevel;

  @OptionalNotNull() @IsBoolean()
  requireCheckout?: boolean;

  // bat buoc khi da mo diem danh ma sua gio / toa do / DRL - dac ta 3.7
  @OptionalNotNull() @Transform(line) @IsString() @Length(3, 500, { message: 'Lý do từ 3 đến 500 ký tự' })
  reason?: string;
}

// Nhan ban: chi can gio moi; cac thong tin con lai chep tu su kien cu - dac ta 3.7
export class DuplicateEventDto {
  @IsOptional() @Transform(line) @IsString() @Length(3, 200, { message: 'Tên sự kiện từ 3 đến 200 ký tự' })
  title?: string;

  @Transform(isoDate) @IsDate({ message: DATE_MSG })
  startAt: Date;

  @Transform(isoDate) @IsDate({ message: DATE_MSG })
  endAt: Date;
}

// Doan truong cho / thu hoi quyen xem cua cac khoa doi voi su kien cap truong - dac ta 2.2
export class FacultyViewDto {
  // NONE = khong chia se, ALL = moi khoa, SELECTED = chi cac khoa trong unitIds
  @IsIn(['NONE', 'ALL', 'SELECTED'], { message: 'mode phải là NONE, ALL hoặc SELECTED' })
  mode: FacultyViewMode;

  // chi dung (va bat buoc) khi mode = SELECTED; kiem tra cheo o service
  @IsOptional() @IsArray() @ArrayMaxSize(50, { message: 'Tối đa 50 khoa' }) @ArrayUnique({ message: 'Danh sách khoa bị trùng' })
  @IsUUID(undefined, { each: true, message: 'Mã khoa không hợp lệ' })
  unitIds?: string[];

  @Transform(line) @IsString() @Length(3, 500, { message: 'Vui lòng nhập lý do (ít nhất 3 ký tự)' })
  reason: string;
}

export class QrPurposeQuery {
  @IsIn(['CHECKIN', 'CHECKOUT'], { message: 'purpose phải là CHECKIN hoặc CHECKOUT' })
  purpose: 'CHECKIN' | 'CHECKOUT' = 'CHECKIN';
}

export class RotateQrDto {
  @IsIn(['CHECKIN', 'CHECKOUT'], { message: 'purpose phải là CHECKIN hoặc CHECKOUT' })
  purpose: 'CHECKIN' | 'CHECKOUT';

  @Transform(line) @IsString() @Length(3, 500, { message: 'Vui lòng nhập lý do (ít nhất 3 ký tự)' })
  reason: string;
}

const VIEWS = ['active', 'cancelled', 'archived'] as const;
const STATUSES: EventStatus[] = ['DRAFT', 'PUBLISHED', 'CHECKIN_OPEN', 'CHECKIN_CLOSED', 'REVIEWING', 'FINALIZED', 'CANCELLED'];

export class EventListQuery extends PaginationQuery {
  // bo loc "Dang hoat dong / Da huy / Luu tru" - dac ta 10
  @IsOptional() @IsIn(VIEWS as unknown as string[], { message: 'view không hợp lệ' })
  view: (typeof VIEWS)[number] = 'active';

  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsIn(STATUSES, { message: 'status không hợp lệ' }) status?: EventStatus;
  @IsOptional() @Transform(line) @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Date) @IsDate({ message: 'from phải là ngày hợp lệ' }) from?: Date;
  @IsOptional() @Type(() => Date) @IsDate({ message: 'to phải là ngày hợp lệ' }) to?: Date;
}

export interface EventDto {
  id: string;
  unit: { id: string; name: string; code: string } | null;
  title: string;
  description: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusM: number | null;
  startAt: Date;
  endAt: Date;
  checkinOpenAt: Date;
  checkinCloseAt: Date;
  graceMinutes: number;
  hasDrl: boolean;
  drlPoints: number | null;
  controlLevel: ControlLevel;
  requireCheckout: boolean;
  hasVerifyCode: boolean;
  facultyViewMode: FacultyViewMode;
  // cac khoa duoc chon (mode SELECTED); null = khong co quyen xem danh sach nay hoac danh sach chua nap (dang list)
  facultyViewUnitIds: string[] | null;
  // false = chi duoc xem (quan ly khoa xem su kien cap truong duoc chia se); giao dien an cac nut sua
  canManage: boolean;
  status: EventStatus;
  // trang thai diem danh THAT luc nay (theo khung gio / bam tay)
  checkinState: CheckinState;
  cancelReason: string | null;
  archivedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toEventDto(
  e: Event, now = new Date(), canManage = true, facultyViewUnitIds: string[] | null = null,
): EventDto {
  return {
    id: e.id,
    unit: e.unit ? { id: e.unit.id, name: e.unit.name, code: e.unit.code } : null,
    title: e.title,
    description: e.description,
    locationName: e.locationName,
    latitude: e.latitude,
    longitude: e.longitude,
    radiusM: e.radiusM,
    startAt: e.startAt,
    endAt: e.endAt,
    checkinOpenAt: e.checkinOpenAt,
    checkinCloseAt: e.checkinCloseAt,
    graceMinutes: e.graceMinutes,
    hasDrl: e.hasDrl,
    drlPoints: e.drlPoints,
    controlLevel: e.controlLevel,
    requireCheckout: e.requireCheckout,
    hasVerifyCode: e.verifyCodeHash !== null,
    facultyViewMode: e.facultyViewMode,
    facultyViewUnitIds,
    canManage,
    status: e.status,
    checkinState: checkinState(e, now),
    cancelReason: e.cancelReason,
    archivedAt: e.archivedAt,
    createdBy: e.createdBy,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// [BM] truong an toan de ghi nhat ky truoc / sau: khong co hash ma 4 so, khong co token
export function eventAuditView(e: Event) {
  return {
    unitId: e.unitId,
    title: e.title,
    description: e.description,
    locationName: e.locationName,
    latitude: e.latitude,
    longitude: e.longitude,
    radiusM: e.radiusM,
    startAt: e.startAt,
    endAt: e.endAt,
    checkinOpenAt: e.checkinOpenAt,
    checkinCloseAt: e.checkinCloseAt,
    graceMinutes: e.graceMinutes,
    hasDrl: e.hasDrl,
    drlPoints: e.drlPoints,
    controlLevel: e.controlLevel,
    requireCheckout: e.requireCheckout,
    facultyViewMode: e.facultyViewMode,
    status: e.status,
    archivedAt: e.archivedAt,
  };
}
