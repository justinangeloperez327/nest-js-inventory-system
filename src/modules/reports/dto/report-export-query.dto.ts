import {
  IsIn,
  IsOptional,
} from 'class-validator';

import { OptionalTrimQueryString } from '../../../common/transforms/query.transforms.js';
import { ReportQueryDto } from './report-query.dto.js';

export class ReportExportQueryDto extends ReportQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsIn(['csv'])
  format?: 'csv';
}
