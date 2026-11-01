// Du lieu vao khieu nai cua sinh vien - dac ta 3.5. [BM] chi chan hinh dang o day; MSSV / khoa kiem o service.
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { AppealType } from '../../appeals/appeal.entity';

const clean = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.normalize('NFC').replace(/[^\S\n]+/g, ' ').trim() : value;
export const APPEAL_TYPES: AppealType[] = ['WRONG_INFO', 'NO_CHECKIN', 'PROXY_CHECKIN', 'DUPLICATE_MSSV'];

export class CreateAppealDto {
  // token QR cua su kien (sinh vien da quet); nam trong body nhu cac API public khac
  @IsString() @MaxLength(64)
  token: string;

  @IsUUID('4')
  idempotencyKey: string;

  @IsIn(APPEAL_TYPES, { message: 'Loại khiếu nại không hợp lệ' })
  type: AppealType;

  @Transform(clean) @IsString() @Length(10, 1000, { message: 'Nội dung khiếu nại từ 10 đến 1000 ký tự' })
  content: string;

  // thiet bi chua co luot diem danh trong su kien: phai khai MSSV, ho ten, khoa
  @IsOptional() @IsString() @MaxLength(30)
  mssv?: string;

  @IsOptional() @Transform(clean) @IsString() @Length(2, 100)
  fullName?: string;

  @IsOptional() @IsUUID()
  facultyUnitId?: string;
}
