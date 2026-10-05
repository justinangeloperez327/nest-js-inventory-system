import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class InventoryTransferProductQueryDto {
  @IsUUID('4')
  sourceWarehouseId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  search!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 20;
}
