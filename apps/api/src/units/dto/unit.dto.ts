import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateUnitDto {
  @Transform(trim) @IsString() @Length(2, 150, { message: 'Tên đơn vị từ 2 đến 150 ký tự' })
  name: string;

  @Transform(upper)
  @Matches(/^[A-Z0-9_]{2,20}$/, { message: 'Mã đơn vị gồm 2–20 ký tự chữ hoa, số hoặc gạch dưới' })
  code: string;
}

export class UpdateUnitDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 150, { message: 'Tên đơn vị từ 2 đến 150 ký tự' })
  name?: string;

  @IsOptional() @Transform(upper)
  @Matches(/^[A-Z0-9_]{2,20}$/, { message: 'Mã đơn vị gồm 2–20 ký tự chữ hoa, số hoặc gạch dưới' })
  code?: string;
}

// ReasonDto dung chung cho moi thao tac bat buoc co ly do - dac ta 3.7
export { ReasonDto } from '../../common/dto/reason.dto';
