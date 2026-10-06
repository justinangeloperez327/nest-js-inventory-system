import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { OptionalTrimQueryString } from '../../../common/transforms/query.transforms.js';
import {
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderStatus,
} from '../purchase-order.constants.js';

export class PurchaseOrderQueryDto extends ListQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsIn(PURCHASE_ORDER_STATUSES)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateTo?: string;
}
