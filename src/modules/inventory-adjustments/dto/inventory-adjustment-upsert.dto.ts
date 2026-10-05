import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import {
  INVENTORY_ADJUSTMENT_DIRECTIONS,
  type InventoryAdjustmentDirection,
} from '../inventory-adjustment.constants.js';

export class InventoryAdjustmentUpsertDto {
  @IsUUID('4')
  productId!: string;

  @IsUUID('4')
  warehouseId!: string;

  @IsIn(INVENTORY_ADJUSTMENT_DIRECTIONS)
  direction!: InventoryAdjustmentDirection;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase()
      : value,
  )
  @IsString()
  @MaxLength(64)
  reasonCode!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim() || undefined
      : value,
  )
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
