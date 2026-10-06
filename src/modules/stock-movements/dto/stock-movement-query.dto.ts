import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { OptionalTrimQueryString } from '../../../common/transforms/query.transforms.js';
import {
  STOCK_MOVEMENT_TYPES,
  type StockMovementType,
} from '../stock-movement.types.js';

export class StockMovementQueryDto extends ListQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsIn(STOCK_MOVEMENT_TYPES)
  type?: StockMovementType;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
