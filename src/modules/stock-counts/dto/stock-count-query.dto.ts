import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import {
  STOCK_COUNT_STATUSES,
  type StockCountStatus,
} from '../stock-count.constants.js';

export class StockCountQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @IsIn(STOCK_COUNT_STATUSES)
  status?: StockCountStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
