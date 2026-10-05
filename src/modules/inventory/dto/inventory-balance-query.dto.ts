import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';

export const INVENTORY_STOCK_STATUSES = [
  'in-stock',
  'low-stock',
  'out-of-stock',
] as const;

export type InventoryStockStatus =
  (typeof INVENTORY_STOCK_STATUSES)[number];

export class InventoryBalanceQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @IsIn(INVENTORY_STOCK_STATUSES)
  status?: InventoryStockStatus;
}
