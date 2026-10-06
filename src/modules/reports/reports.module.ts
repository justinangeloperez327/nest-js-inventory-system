import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
