import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { SupplierListQueryDto } from './dto/supplier-list-query.dto.js';
import { SupplierStatusDto } from './dto/supplier-status.dto.js';
import { SupplierUpsertDto } from './dto/supplier-upsert.dto.js';
import { SuppliersService } from './suppliers.service.js';

@Controller('suppliers')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class SuppliersController {
  constructor(
    private readonly suppliers: SuppliersService,
  ) {}

  @Get()
  @RequirePermissions(Permission.SuppliersRead)
  list(@Query() query: SupplierListQueryDto) {
    return this.suppliers.list(query);
  }

  @Get(':id/purchase-history')
  @RequirePermissions(
    Permission.SuppliersRead,
    Permission.PurchasesRead,
  )
  purchaseHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.suppliers.purchaseHistory(id, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.SuppliersRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  @RequirePermissions(Permission.SuppliersManage)
  create(@Body() dto: SupplierUpsertDto) {
    return this.suppliers.create(dto);
  }

  @Put(':id')
  @RequirePermissions(Permission.SuppliersManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierUpsertDto,
  ) {
    return this.suppliers.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.SuppliersManage)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierStatusDto,
  ) {
    return this.suppliers.setStatus(id, dto);
  }
}
