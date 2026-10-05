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
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
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
  createRole(@Body() dto: CreateRoleDto) {
    return this.access.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePermissions(Permission.RolesUpdate)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.access.updateRole(id, dto);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions(Permission.RolesAssignPermissions)
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.access.setPermissions(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions(Permission.RolesDelete)
  deleteRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.access.deleteRole(id);
  }

  @Get('permissions')
  @RequirePermissions(Permission.PermissionsRead)
  listPermissions(@Query() query: ListQueryDto) {
    return this.access.listPermissions(query);
  }
}
