import {
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { OptionalTrimQueryString } from '../../../common/transforms/query.transforms.js';

export const INVENTORY_STOCK_STATUSES = [
  'in-stock',
  'low-stock',
  'out-of-stock',
] as const;

export type InventoryStockStatus =
  (typeof INVENTORY_STOCK_STATUSES)[number];

export class InventoryBalanceQueryDto extends ListQueryDto {
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
  @IsIn(INVENTORY_STOCK_STATUSES)
  status?: InventoryStockStatus;
}
