// Ly do bat buoc cho thao tac anh huong nhieu du lieu - dac ta 3.7
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ReasonDto {
  @Transform(trim) @IsString() @MinLength(3, { message: 'Vui lòng nhập lý do (ít nhất 3 ký tự)' }) @MaxLength(500)
  reason: string;
}
