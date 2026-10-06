import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';

export class AuditLogQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  entityId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
