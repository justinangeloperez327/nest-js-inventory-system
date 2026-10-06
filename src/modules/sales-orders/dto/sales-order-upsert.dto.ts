import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SalesOrderLineDto {
  @IsUUID('4')
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(999999999999999)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(999999999999999)
  unitPrice!: number;
}

export class SalesOrderUpsertDto {
  @IsUUID('4')
  customerId!: string;

  @IsUUID('4')
  warehouseId!: string;

  @IsDateString({ strict: true })
  orderDate!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim() || undefined
      : value,
  )
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineDto)
  lines!: SalesOrderLineDto[];
}
