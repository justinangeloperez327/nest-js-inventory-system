import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { ProductListQueryDto } from './dto/product-list-query.dto.js';
import { ProductStatusDto } from './dto/product-status.dto.js';
import { ProductUpsertDto } from './dto/product-upsert.dto.js';
import { ProductsService } from './products.service.js';

@Controller('products')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(Permission.ProductsRead)
  list(@Query() query: ProductListQueryDto) {
    return this.products.list(query);
  }

  @Get('form-options')
  @RequirePermissions(Permission.ProductsRead)
  formOptions() {
    return this.products.formOptions();
  }

  @Get(':id')
  @RequirePermissions(Permission.ProductsRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post()
  @RequirePermissions(Permission.ProductsCreate)
  create(
    @Body() dto: ProductUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.products.create(
      dto,
      user.id,
    );
  }

  @Put(':id')
  @RequirePermissions(Permission.ProductsUpdate)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.products.update(
      id,
      dto,
      user.id,
    );
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    const required = dto.active
      ? Permission.ProductsUpdate
      : Permission.ProductsDeactivate;

    if (!user.permissions.includes(required)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message:
          'You do not have permission to change this product status',
        details: { required: [required] },
      });
    }

    return this.products.setStatus(
      id,
      dto,
      user.id,
    );
  }
}
