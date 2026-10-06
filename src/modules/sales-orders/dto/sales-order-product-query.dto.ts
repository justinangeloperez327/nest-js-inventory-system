import { IsUUID } from 'class-validator';

import { SalesOrderLookupQueryDto } from './sales-order-lookup-query.dto.js';

export class SalesOrderProductQueryDto
  extends SalesOrderLookupQueryDto {
  @IsUUID('4')
  warehouseId!: string;
}
