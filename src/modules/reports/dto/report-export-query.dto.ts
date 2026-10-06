import { IsIn, IsOptional } from 'class-validator';

import { ReportQueryDto } from './report-query.dto.js';

export class ReportExportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}
