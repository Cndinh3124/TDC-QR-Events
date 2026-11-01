import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../common/dto/pagination.dto';

export class AuditQuery extends PaginationQuery {
  @IsOptional() @IsString() @MaxLength(36)
  actorId?: string;

  @IsOptional() @IsString() @MaxLength(40)
  entity?: string;

  @IsOptional() @IsString() @MaxLength(64)
  entityId?: string;

  @IsOptional() @IsString() @MaxLength(60)
  action?: string;

  @IsOptional() @Type(() => Date) @IsDate({ message: 'from phải là ngày hợp lệ' })
  from?: Date;

  @IsOptional() @Type(() => Date) @IsDate({ message: 'to phải là ngày hợp lệ' })
  to?: Date;
}
