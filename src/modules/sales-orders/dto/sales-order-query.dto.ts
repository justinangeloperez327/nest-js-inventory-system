import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import {
  SALES_ORDER_STATUSES,
  type SalesOrderStatus,
} from '../sales-order.constants.js';

export class SalesOrderQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @IsIn(SALES_ORDER_STATUSES)
  status?: SalesOrderStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
