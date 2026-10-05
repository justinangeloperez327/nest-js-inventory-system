import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MAX_DECIMAL_19_4 = 999999999999999.9999;

export class ProductUpsertDto {
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim() || undefined
      : value,
  )
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim() || undefined
      : value,
  )
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsUUID('4')
  unitId?: string;

  @Type(() => Number)
  @IsNumber({
    allowInfinity: false,
    allowNaN: false,
    maxDecimalPlaces: 4,
  })
  @Min(0)
  @Max(MAX_DECIMAL_19_4)
  costPrice!: number;

  @Type(() => Number)
  @IsNumber({
    allowInfinity: false,
    allowNaN: false,
    maxDecimalPlaces: 4,
  })
  @Min(0)
  @Max(MAX_DECIMAL_19_4)
  sellingPrice!: number;

  @Type(() => Number)
  @IsNumber({
    allowInfinity: false,
    allowNaN: false,
    maxDecimalPlaces: 4,
  })
  @Min(0)
  @Max(MAX_DECIMAL_19_4)
  reorderLevel!: number;
}
