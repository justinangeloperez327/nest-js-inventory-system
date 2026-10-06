import {
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { OptionalTrimQueryString } from '../../../common/transforms/query.transforms.js';
import {
  INVENTORY_TRANSFER_STATUSES,
  type InventoryTransferStatus,
} from '../inventory-transfer.constants.js';

export class InventoryTransferQueryDto extends ListQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  sourceWarehouseId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  destinationWarehouseId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsIn(INVENTORY_TRANSFER_STATUSES)
  status?: InventoryTransferStatus;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateTo?: string;
}
