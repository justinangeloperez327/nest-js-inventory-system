import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { OptionalTrimQueryString } from '../../../common/transforms/query.transforms.js';

export class AuditLogQueryDto extends ListQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsString()
  @MaxLength(200)
  entityId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsDateString()
  dateTo?: string;
}
