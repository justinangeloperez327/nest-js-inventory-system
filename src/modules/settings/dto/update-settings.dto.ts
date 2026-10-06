import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  STOCK_COUNT_CONCURRENCY_POLICIES,
  type StockCountConcurrencyPolicy,
} from '../settings.constants.js';

export class UpdateSettingsDto {
  @IsString()
  @MaxLength(200)
  organizationName!: string;

  @IsString()
  @MaxLength(100)
  timezone!: string;

  @IsString()
  @Length(3, 3)
  currencyCode!: string;

  @IsInt()
  @Min(10)
  @Max(100)
  defaultPageSize!: number;

  @IsBoolean()
  allowNegativeStock!: boolean;

  @IsIn(STOCK_COUNT_CONCURRENCY_POLICIES)
  stockCountConcurrencyPolicy!:
    StockCountConcurrencyPolicy;
}
