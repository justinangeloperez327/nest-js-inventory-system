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
import { GoodsReceiptPurchaseOrderQueryDto } from './dto/goods-receipt-purchase-order-query.dto.js';
import { GoodsReceiptQueryDto } from './dto/goods-receipt-query.dto.js';
import { GoodsReceiptUpsertDto } from './dto/goods-receipt-upsert.dto.js';
import { GoodsReceiptsService } from './goods-receipts.service.js';

@Controller('goods-receipts')
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions(Permission.PurchasesReceive)
export class GoodsReceiptsController {
  constructor(
    private readonly goodsReceipts: GoodsReceiptsService,
  ) {}

  @Get()
  list(@Query() query: GoodsReceiptQueryDto) {
    return this.goodsReceipts.list(query);
  }

  @Get('form-options')
  formOptions() {
    return this.goodsReceipts.formOptions();
  }

  @Get('purchase-order-options')
  purchaseOrderOptions(
    @Query() query: GoodsReceiptPurchaseOrderQueryDto,
  ) {
    return this.goodsReceipts.purchaseOrderOptions(query);
  }

  @Get('purchase-orders/:purchaseOrderId/context')
  purchaseOrderContext(
    @Param('purchaseOrderId', ParseUUIDPipe)
    purchaseOrderId: string,
  ) {
    return this.goodsReceipts.purchaseOrderContext(
      purchaseOrderId,
    );
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.goodsReceipts.get(id);
  }

  @Post()
  create(
    @Body() dto: GoodsReceiptUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.goodsReceipts.create(dto, user.id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GoodsReceiptUpsertDto,
  ) {
    return this.goodsReceipts.update(id, dto);
  }

  @Post(':id/post')
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.goodsReceipts.post(id, user.id);
  }
}
