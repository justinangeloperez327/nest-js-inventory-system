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
import { InventoryTransferProductQueryDto } from './dto/inventory-transfer-product-query.dto.js';
import { InventoryTransferQueryDto } from './dto/inventory-transfer-query.dto.js';
import { InventoryTransferUpsertDto } from './dto/inventory-transfer-upsert.dto.js';
import { InventoryTransfersService } from './inventory-transfers.service.js';

@Controller('inventory-transfers')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class InventoryTransfersController {
  constructor(
    private readonly transfers: InventoryTransfersService,
  ) {}

  @Get()
  @RequirePermissions(Permission.InventoryRead)
  list(@Query() query: InventoryTransferQueryDto) {
    return this.transfers.list(query);
  }

  @Get('form-options')
  @RequirePermissions(Permission.InventoryRead)
  formOptions() {
    return this.transfers.formOptions();
  }

  @Get('product-options')
  @RequirePermissions(Permission.InventoryTransfer)
  productOptions(
    @Query() query: InventoryTransferProductQueryDto,
  ) {
    return this.transfers.productOptions(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.InventoryRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.get(id);
  }

  @Post()
  @RequirePermissions(Permission.InventoryTransfer)
  create(
    @Body() dto: InventoryTransferUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.transfers.create(dto, user.id);
  }

  @Put(':id')
  @RequirePermissions(Permission.InventoryTransfer)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InventoryTransferUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.transfers.update(
      id,
      dto,
      user.id,
    );
  }

  @Post(':id/post')
  @RequirePermissions(Permission.InventoryTransfer)
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.transfers.post(id, user.id);
  }
}
