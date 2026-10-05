import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AccessControlController } from './access-control.controller.js';
import { AccessControlService } from './access-control.service.js';
import { PermissionsGuard } from './guards/permissions.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [AccessControlController],
  providers: [AccessControlService, PermissionsGuard],
  exports: [PermissionsGuard],
})
export class AccessControlModule {}
