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
import { CreateUserDto } from './dto/create-user.dto.js';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto.js';
import { SetUserRolesDto } from './dto/set-user-roles.dto.js';
import { SetUserStatusDto } from './dto/set-user-status.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserListQueryDto } from './dto/user-list-query.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permission.UsersRead)
  list(@Query() query: UserListQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.UsersRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermissions(Permission.UsersCreate)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.create(
      dto,
      actor.id,
    );
  }

  @Patch(':id')
  @RequirePermissions(Permission.UsersUpdate)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(
      id,
      dto,
      actor.id,
    );
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.UsersDeactivate)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.setStatus(
      id,
      dto,
      actor.id,
    );
  }

  @Put(':id/roles')
  @RequirePermissions(Permission.UsersAssignRoles)
  setRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.setRoles(
      id,
      dto,
      actor.id,
    );
  }

  @Put(':id/password')
  @RequirePermissions(Permission.UsersUpdate)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.resetPassword(
      id,
      dto,
      actor.id,
    );
  }
}
