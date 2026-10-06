import { IsUUID } from 'class-validator';

import { TrimQueryString } from '../../../common/transforms/query.transforms.js';
import { SalesOrderLookupQueryDto } from './sales-order-lookup-query.dto.js';

export class SalesOrderProductQueryDto
  extends SalesOrderLookupQueryDto {
  @TrimQueryString()
  @IsUUID('4')
  warehouseId!: string;
}
