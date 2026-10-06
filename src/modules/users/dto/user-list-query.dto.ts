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

export class UserListQueryDto extends ListQueryDto {
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @OptionalTrimQueryString()
  @IsUUID('4')
  roleId?: string;
}
