import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { AuditService } from './audit.service.js';
import { AuditLogQueryDto } from './dto/audit-log-query.dto.js';

@Controller('audit-logs')
@UseGuards(
  AccessTokenGuard,
  PermissionsGuard,
)
@RequirePermissions(Permission.AuditRead)
export class AuditController {
  constructor(
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @Query() query: AuditLogQueryDto,
  ) {
    return this.audit.list(query);
  }

  @Get('options')
  options() {
    return this.audit.options();
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.audit.get(id);
  }
}
