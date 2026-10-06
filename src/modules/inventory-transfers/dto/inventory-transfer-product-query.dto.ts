import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  StrictIntegerQuery,
  TrimQueryString,
} from '../../../common/transforms/query.transforms.js';

export class InventoryTransferProductQueryDto {
  @TrimQueryString()
  @IsUUID('4')
  sourceWarehouseId!: string;

  @TrimQueryString()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  search!: string;

  @StrictIntegerQuery()
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 20;
}
