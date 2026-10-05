import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { SortOrder } from '../enums/sort-order.enum.js';
import { PaginationQueryDto } from './pagination-query.dto.js';

export class ListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sort?: string;

  @IsOptional()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.Asc;
}
