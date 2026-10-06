import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions(Permission.DashboardView)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
  ) {}

  @Get()
  getDashboard(
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboard.getDashboard(user);
  }
}
