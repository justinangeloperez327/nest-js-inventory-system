import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '../../stock-movements/stock-movement.types.js';

export class ReportQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @IsIn(STOCK_MOVEMENT_TYPES)
  movementType?: StockMovementType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
