import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StockMovementsModule } from '../stock-movements/stock-movements.module.js';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller.js';
import { InventoryAdjustmentsService } from './inventory-adjustments.service.js';

@Module({
  imports: [
    AuthModule,
    AccessControlModule,
    StockMovementsModule,
  ],
  controllers: [InventoryAdjustmentsController],
  providers: [InventoryAdjustmentsService],
})
export class InventoryAdjustmentsModule {}
