import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  AdministrationAuditController,
  AdministrationRolesController,
  AdministrationUsersController,
} from './administration.controller.js';
import { AdministrationService } from './administration.service.js';

@Module({
  imports: [
    AuthModule,
    AccessControlModule,
    UsersModule,
  ],
  controllers: [
    AdministrationUsersController,
    AdministrationRolesController,
    AdministrationAuditController,
  ],
  providers: [AdministrationService],
})
export class AdministrationModule {}
