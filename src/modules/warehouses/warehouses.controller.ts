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

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { WarehouseListQueryDto } from './dto/warehouse-list-query.dto.js';
import { WarehouseStatusDto } from './dto/warehouse-status.dto.js';
import { WarehouseUpsertDto } from './dto/warehouse-upsert.dto.js';
import { WarehousesService } from './warehouses.service.js';

@Controller('warehouses')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class WarehousesController {
  constructor(
    private readonly warehouses: WarehousesService,
  ) {}

  @Get()
  @RequirePermissions(Permission.WarehousesRead)
  list(@Query() query: WarehouseListQueryDto) {
    return this.warehouses.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.WarehousesRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouses.get(id);
  }

  @Post()
  @RequirePermissions(Permission.WarehousesManage)
  create(@Body() dto: WarehouseUpsertDto) {
    return this.warehouses.create(dto);
  }

  @Put(':id')
  @RequirePermissions(Permission.WarehousesManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WarehouseUpsertDto,
  ) {
    return this.warehouses.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.WarehousesManage)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WarehouseStatusDto,
  ) {
    return this.warehouses.setStatus(id, dto);
  }
}
