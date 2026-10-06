import {
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';
import {
  BooleanQuery,
  OptionalTrimQueryString,
} from '../../../common/transforms/query.transforms.js';

export class ProductListQueryDto extends ListQueryDto {
  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  active?: boolean;
}
