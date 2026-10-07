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
import {
  AdministrationAuditQueryDto,
  AdministrationRoleUpsertDto,
  AdministrationUserQueryDto,
  AdministrationUserStatusDto,
  AdministrationUserUpsertDto,
} from './dto/administration.dto.js';
import { AdministrationService } from './administration.service.js';

@Controller('administration/users')
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions(Permission.UsersRead)
export class AdministrationUsersController {
  constructor(
    private readonly administration: AdministrationService,
  ) {}

  @Get()
  list(
    @Query() query: AdministrationUserQueryDto,
  ) {
    return this.administration.listUsers(query);
  }

  @Get('form-options')
  formOptions() {
    return this.administration.userFormOptions();
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.administration.getUser(id);
  }

  @Post()
  @RequirePermissions(Permission.UsersCreate)
  create(
    @Body() dto: AdministrationUserUpsertDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.administration.createUser(
      dto,
      actor.id,
    );
  }

  @Put(':id')
  @RequirePermissions(Permission.UsersUpdate)
  update(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body() dto: AdministrationUserUpsertDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.administration.updateUser(
      id,
      dto,
      actor.id,
    );
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.UsersDeactivate)
  setStatus(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body() dto: AdministrationUserStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.administration.setUserStatus(
      id,
      dto.active,
      actor.id,
    );
  }
}

@Controller('administration/roles')
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions(Permission.RolesRead)
export class AdministrationRolesController {
  constructor(
    private readonly administration: AdministrationService,
  ) {}

  @Get()
  list() {
    return this.administration.listRoles();
  }

  @Get('form-options')
  formOptions() {
    return this.administration.roleFormOptions();
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.administration.getRole(id);
  }

  @Post()
  @RequirePermissions(Permission.RolesCreate)
  create(
    @Body() dto: AdministrationRoleUpsertDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.administration.createRole(
      dto,
      actor.id,
    );
  }

  @Put(':id')
  @RequirePermissions(Permission.RolesUpdate)
  update(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body() dto: AdministrationRoleUpsertDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.administration.updateRole(
      id,
      dto,
      actor.id,
    );
  }
}

@Controller('administration/audit-log')
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions(Permission.AuditRead)
export class AdministrationAuditController {
  constructor(
    private readonly administration: AdministrationService,
  ) {}

  @Get()
  list(
    @Query() query: AdministrationAuditQueryDto,
  ) {
    return this.administration.listAudit(query);
  }

  @Get('options')
  options() {
    return this.administration.auditOptions();
  }
}
