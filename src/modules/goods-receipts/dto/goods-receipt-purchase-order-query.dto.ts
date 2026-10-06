import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class GoodsReceiptPurchaseOrderQueryDto {
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
