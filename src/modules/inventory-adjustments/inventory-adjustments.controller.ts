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
import { InventoryAdjustmentProductQueryDto } from './dto/inventory-adjustment-product-query.dto.js';
import { InventoryAdjustmentQueryDto } from './dto/inventory-adjustment-query.dto.js';
import { InventoryAdjustmentUpsertDto } from './dto/inventory-adjustment-upsert.dto.js';
import { InventoryAdjustmentsService } from './inventory-adjustments.service.js';

@Controller('inventory-adjustments')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class InventoryAdjustmentsController {
  constructor(
    private readonly adjustments: InventoryAdjustmentsService,
  ) {}

  @Get()
  @RequirePermissions(Permission.InventoryRead)
  list(@Query() query: InventoryAdjustmentQueryDto) {
    return this.adjustments.list(query);
  }

  @Get('form-options')
  @RequirePermissions(Permission.InventoryRead)
  formOptions() {
    return this.adjustments.formOptions();
  }

  @Get('product-options')
  @RequirePermissions(Permission.InventoryAdjust)
  productOptions(
    @Query() query: InventoryAdjustmentProductQueryDto,
  ) {
    return this.adjustments.productOptions(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.InventoryRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adjustments.get(id);
  }

  @Post()
  @RequirePermissions(Permission.InventoryAdjust)
  create(
    @Body() dto: InventoryAdjustmentUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adjustments.create(dto, user.id);
  }

  @Put(':id')
  @RequirePermissions(Permission.InventoryAdjust)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InventoryAdjustmentUpsertDto,
  ) {
    return this.adjustments.update(id, dto);
  }

  @Post(':id/post')
  @RequirePermissions(Permission.InventoryAdjust)
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adjustments.post(id, user.id);
  }
}
