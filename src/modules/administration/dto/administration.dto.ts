import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import {
  BooleanQuery,
  OptionalTrimQueryString,
  TrimQueryString,
} from '../../../common/transforms/query.transforms.js';

export class AdministrationUserQueryDto extends ListQueryDto {
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  roleId?: string;
}

export class AdministrationUserUpsertDto {
  @TrimQueryString()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @TrimQueryString()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}

export class AdministrationUserStatusDto {
  @IsBoolean()
  active!: boolean;
}

export class AdministrationRoleUpsertDto {
  @TrimQueryString()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissions!: string[];
}

export class AdministrationAuditQueryDto extends ListQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsString()
  @MaxLength(100)
  area?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateTo?: string;
}
