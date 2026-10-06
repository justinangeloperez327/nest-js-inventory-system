import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SalesReturnLineDto {
  @IsUUID('4')
  salesOrderLineId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(999999999999999)
  quantity!: number;
}

export class SalesReturnDto {
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
  @Type(() => SalesReturnLineDto)
  lines!: SalesReturnLineDto[];
}
