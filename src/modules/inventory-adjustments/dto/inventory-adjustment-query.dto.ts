import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { OptionalTrimQueryString } from '../../../common/transforms/query.transforms.js';
import {
  INVENTORY_ADJUSTMENT_DIRECTIONS,
  INVENTORY_ADJUSTMENT_STATUSES,
  type InventoryAdjustmentDirection,
  type InventoryAdjustmentStatus,
} from '../inventory-adjustment.constants.js';

export class InventoryAdjustmentQueryDto extends ListQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsIn(INVENTORY_ADJUSTMENT_DIRECTIONS)
  direction?: InventoryAdjustmentDirection;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsIn(INVENTORY_ADJUSTMENT_STATUSES)
  status?: InventoryAdjustmentStatus;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateTo?: string;
}
