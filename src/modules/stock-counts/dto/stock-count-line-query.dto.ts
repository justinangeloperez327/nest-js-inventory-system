import {
  IsBoolean,
  IsOptional,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import { BooleanQuery } from '../../../common/transforms/query.transforms.js';

export class StockCountLineQueryDto extends ListQueryDto {
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  varianceOnly?: boolean;
}
