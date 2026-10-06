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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { UnitListQueryDto } from './dto/unit-list-query.dto.js';
import { UnitStatusDto } from './dto/unit-status.dto.js';
import { UnitUpsertDto } from './dto/unit-upsert.dto.js';
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
  create(
    @Body() dto: UnitUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.units.create(
      dto,
      user.id,
    );
  }

  @Put(':id')
  @RequirePermissions(Permission.UnitsManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnitUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.units.update(
      id,
      dto,
      user.id,
    );
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.UnitsManage)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnitStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.units.setStatus(
      id,
      dto,
      user.id,
    );
  }
}
