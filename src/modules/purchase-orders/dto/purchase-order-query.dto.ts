import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import {
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderStatus,
} from '../purchase-order.constants.js';

export class PurchaseOrderQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @IsIn(PURCHASE_ORDER_STATUSES)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
