// Phan trang chung { items, total, page, limit } - dac ta 7
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PaginationQuery {
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
