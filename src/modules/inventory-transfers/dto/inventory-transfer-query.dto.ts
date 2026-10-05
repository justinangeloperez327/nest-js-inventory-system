import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import {
  INVENTORY_TRANSFER_STATUSES,
  type InventoryTransferStatus,
} from '../inventory-transfer.constants.js';

export class InventoryTransferQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  sourceWarehouseId?: string;

  @IsOptional()
  @IsUUID('4')
  destinationWarehouseId?: string;

  @IsOptional()
  @IsIn(INVENTORY_TRANSFER_STATUSES)
  status?: InventoryTransferStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
