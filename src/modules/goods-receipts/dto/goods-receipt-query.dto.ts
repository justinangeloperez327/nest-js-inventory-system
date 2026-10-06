import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import {
  GOODS_RECEIPT_STATUSES,
  type GoodsReceiptStatus,
} from '../goods-receipt.constants.js';

export class GoodsReceiptQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  purchaseOrderId?: string;

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @IsIn(GOODS_RECEIPT_STATUSES)
  status?: GoodsReceiptStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
