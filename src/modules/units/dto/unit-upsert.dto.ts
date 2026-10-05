import { Transform } from 'class-transformer';
import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UnitUpsertDto {
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol!: string;
}
