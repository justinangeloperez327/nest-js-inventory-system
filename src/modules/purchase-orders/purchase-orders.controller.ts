import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { PurchaseOrderLookupQueryDto } from './dto/purchase-order-lookup-query.dto.js';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto.js';
import { PurchaseOrderUpsertDto } from './dto/purchase-order-upsert.dto.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

@Controller('purchase-orders')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrders: PurchaseOrdersService,
  ) {}

  @Get()
  @RequirePermissions(Permission.PurchasesRead)
  list(@Query() query: PurchaseOrderQueryDto) {
    return this.purchaseOrders.list(query);
  }

  @Get('form-options')
  @RequirePermissions(Permission.PurchasesRead)
  formOptions() {
    return this.purchaseOrders.formOptions();
  }

  @Get('supplier-options')
  @RequirePermissions(Permission.PurchasesCreate)
  supplierOptions(
    @Query() query: PurchaseOrderLookupQueryDto,
  ) {
    return this.purchaseOrders.supplierOptions(query);
  }

  @Get('product-options')
  @RequirePermissions(Permission.PurchasesCreate)
  productOptions(
    @Query() query: PurchaseOrderLookupQueryDto,
  ) {
    return this.purchaseOrders.productOptions(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.PurchasesRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrders.get(id);
  }

  @Post()
  @RequirePermissions(Permission.PurchasesCreate)
  create(
    @Body() dto: PurchaseOrderUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchaseOrders.create(dto, user.id);
  }

  @Put(':id')
  @RequirePermissions(Permission.PurchasesCreate)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseOrderUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchaseOrders.update(
      id,
      dto,
      user.id,
    );
  }

  @Post(':id/submit')
  @RequirePermissions(Permission.PurchasesCreate)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchaseOrders.submit(id, user.id);
  }

  @Post(':id/approve')
  @RequirePermissions(Permission.PurchasesApprove)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.purchaseOrders.approve(id, user.id);
  }
}
