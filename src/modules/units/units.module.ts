import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
