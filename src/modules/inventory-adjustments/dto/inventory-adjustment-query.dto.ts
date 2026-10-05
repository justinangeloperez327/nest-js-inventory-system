import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import {
  INVENTORY_ADJUSTMENT_DIRECTIONS,
  INVENTORY_ADJUSTMENT_STATUSES,
  type InventoryAdjustmentDirection,
  type InventoryAdjustmentStatus,
} from '../inventory-adjustment.constants.js';

export class InventoryAdjustmentQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @IsIn(INVENTORY_ADJUSTMENT_DIRECTIONS)
  direction?: InventoryAdjustmentDirection;

  @IsOptional()
  @IsIn(INVENTORY_ADJUSTMENT_STATUSES)
  status?: InventoryAdjustmentStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
