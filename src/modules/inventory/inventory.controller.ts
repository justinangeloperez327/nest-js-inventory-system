import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { InventoryBalanceQueryDto } from './dto/inventory-balance-query.dto.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions(Permission.InventoryRead)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('balances')
  listBalances(
    @Query() query: InventoryBalanceQueryDto,
  ) {
    return this.inventory.listBalances(query);
  }

  @Get('form-options')
  formOptions() {
    return this.inventory.formOptions();
  }

  @Get('products/:productId')
  productInventory(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.inventory.productInventory(
      productId,
      query,
    );
  }

  @Get('warehouses/:warehouseId')
  warehouseInventory(
    @Param('warehouseId', ParseUUIDPipe)
    warehouseId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.inventory.warehouseInventory(
      warehouseId,
      query,
    );
  }
}
