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
import { SalesOrderLookupQueryDto } from './dto/sales-order-lookup-query.dto.js';
import { SalesOrderProductQueryDto } from './dto/sales-order-product-query.dto.js';
import { SalesOrderQueryDto } from './dto/sales-order-query.dto.js';
import { SalesOrderUpsertDto } from './dto/sales-order-upsert.dto.js';
import { SalesReturnDto } from './dto/sales-return.dto.js';
import { SalesOrdersService } from './sales-orders.service.js';

@Controller('sales-orders')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class SalesOrdersController {
  constructor(
    private readonly salesOrders: SalesOrdersService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SalesRead)
  list(@Query() query: SalesOrderQueryDto) {
    return this.salesOrders.list(query);
  }

  @Get('form-options')
  @RequirePermissions(Permission.SalesRead)
  formOptions() {
    return this.salesOrders.formOptions();
  }

  @Get('customer-options')
  @RequirePermissions(Permission.SalesCreate)
  customerOptions(
    @Query() query: SalesOrderLookupQueryDto,
  ) {
    return this.salesOrders.customerOptions(query);
  }

  @Get('customers/:customerId/option')
  @RequirePermissions(Permission.SalesCreate)
  customerOption(
    @Param('customerId', ParseUUIDPipe)
    customerId: string,
  ) {
    return this.salesOrders.customerOption(customerId);
  }

  @Get('product-options')
  @RequirePermissions(Permission.SalesCreate)
  productOptions(
    @Query() query: SalesOrderProductQueryDto,
  ) {
    return this.salesOrders.productOptions(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.SalesRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesOrders.get(id);
  }

  @Post()
  @RequirePermissions(Permission.SalesCreate)
  create(
    @Body() dto: SalesOrderUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesOrders.create(dto, user.id);
  }

  @Put(':id')
  @RequirePermissions(Permission.SalesCreate)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalesOrderUpsertDto,
  ) {
    return this.salesOrders.update(id, dto);
  }

  @Post(':id/confirm')
  @RequirePermissions(Permission.SalesConfirm)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesOrders.confirm(id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.SalesDispatch)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesOrders.cancel(id, user.id);
  }

  @Post(':id/dispatch')
  @RequirePermissions(Permission.SalesDispatch)
  dispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesOrders.dispatch(id, user.id);
  }

  @Post(':id/complete')
  @RequirePermissions(Permission.SalesDispatch)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesOrders.complete(id, user.id);
  }

  @Post(':id/returns')
  @RequirePermissions(Permission.SalesReturn)
  createReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalesReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesOrders.createReturn(
      id,
      dto,
      user.id,
    );
  }
}
