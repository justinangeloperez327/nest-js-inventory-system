import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  OptionalTrimQueryString,
  TrimQueryString,
} from '../transforms/query.transforms.js';
import { SortOrder } from '../enums/sort-order.enum.js';
import { PaginationQueryDto } from './pagination-query.dto.js';

export class ListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsString()
  @MaxLength(64)
  sort?: string;

  @TrimQueryString()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.Asc;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsEnum(SortOrder)
  direction?: SortOrder;

  get resolvedOrder(): SortOrder {
    return (
      this.direction ??
      this.order
    );
  }
}
