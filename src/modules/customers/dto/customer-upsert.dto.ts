import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

function optionalTrim(value: unknown): unknown {
  return typeof value === 'string'
    ? value.trim() || undefined
    : value;
}

export class CustomerUpsertDto {
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
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase() || undefined
      : value,
  )
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase() || undefined
      : value,
  )
  @IsString()
  @MaxLength(100)
  taxNumber?: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  @MaxLength(250)
  addressLine1?: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  @MaxLength(250)
  addressLine2?: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  @MaxLength(100)
  stateProvince?: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  @MaxLength(30)
  postalCode?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase() || undefined
      : value,
  )
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}
