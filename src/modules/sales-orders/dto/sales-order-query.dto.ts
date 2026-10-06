import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { OptionalTrimQueryString } from '../../../common/transforms/query.transforms.js';
import {
  SALES_ORDER_STATUSES,
  type SalesOrderStatus,
} from '../sales-order.constants.js';

export class SalesOrderQueryDto extends ListQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  customerId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsIn(SALES_ORDER_STATUSES)
  status?: SalesOrderStatus;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateTo?: string;
}
