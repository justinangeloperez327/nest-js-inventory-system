import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { CreateUnitDto } from './dto/create-unit.dto.js';
import { SetUnitStatusDto } from './dto/set-unit-status.dto.js';
import { UnitListQueryDto } from './dto/unit-list-query.dto.js';
import { UpdateUnitDto } from './dto/update-unit.dto.js';
import { UnitsService } from './units.service.js';

@Controller('units')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @RequirePermissions(Permission.UnitsRead)
  list(@Query() query: UnitListQueryDto) {
    return this.units.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.UnitsRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.units.get(id);
  }

  @Post()
  @RequirePermissions(Permission.UnitsManage)
  create(@Body() dto: CreateUnitDto) {
    return this.units.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.UnitsManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.units.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.UnitsManage)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUnitStatusDto,
  ) {
    return this.units.setStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.UnitsManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.units.remove(id);
  }
}
