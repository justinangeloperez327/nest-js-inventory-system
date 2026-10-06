import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { SettingsService } from './settings.service.js';

@Controller('administration/settings')
@UseGuards(
  AccessTokenGuard,
  PermissionsGuard,
)
@RequirePermissions(Permission.SettingsManage)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
  ) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Get('options')
  options() {
    return this.settings.options();
  }

  @Put()
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.update(
      dto,
      user.id,
    );
  }
}
