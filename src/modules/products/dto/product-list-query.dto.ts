import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ListQueryDto } from '../../../common/dto/list-query.dto.js';

export class ProductListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}
