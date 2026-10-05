import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WarehousesController } from './warehouses.controller.js';
import { WarehousesService } from './warehouses.service.js';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [WarehousesController],
  providers: [WarehousesService],
})
export class WarehousesModule {}
