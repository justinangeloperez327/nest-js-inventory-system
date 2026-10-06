import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ListQueryDto } from '../../common/dto/list-query.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessControlService } from './access-control.service.js';
import { RequirePermissions } from './decorators/permissions.decorator.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { Permission } from './rbac.constants.js';

@Controller()
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class AccessControlController {
  constructor(private readonly access: AccessControlService) {}

  @Get('roles')
  @RequirePermissions(Permission.RolesRead)
  listRoles(@Query() query: ListQueryDto) {
    return this.access.listRoles(query);
  }

  @Get('roles/:id')
  @RequirePermissions(Permission.RolesRead)
  getRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.access.getRole(id);
  }

  @Post('roles')
  @RequirePermissions(Permission.RolesCreate)
  createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.access.createRole(
      dto,
      actor.id,
    );
  }

  @Patch('roles/:id')
  @RequirePermissions(Permission.RolesUpdate)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.access.updateRole(
      id,
      dto,
      actor.id,
    );
  }

  @Put('roles/:id/permissions')
  @RequirePermissions(Permission.RolesAssignPermissions)
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.access.setPermissions(
      id,
      dto,
      actor.id,
    );
  }

  @Delete('roles/:id')
  @RequirePermissions(Permission.RolesDelete)
  deleteRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.access.deleteRole(
      id,
      actor.id,
    );
  }

  @Get('permissions')
  @RequirePermissions(Permission.PermissionsRead)
  listPermissions(@Query() query: ListQueryDto) {
    return this.access.listPermissions(query);
  }
}
