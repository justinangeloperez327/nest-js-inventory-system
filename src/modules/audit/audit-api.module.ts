import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditController } from './audit.controller.js';
import { AuditModule } from './audit.module.js';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    AccessControlModule,
  ],
  controllers: [AuditController],
})
export class AuditApiModule {}
