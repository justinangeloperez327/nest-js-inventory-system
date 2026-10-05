import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StockMovementsModule } from '../stock-movements/stock-movements.module.js';
import { InventoryTransfersController } from './inventory-transfers.controller.js';
import { InventoryTransfersService } from './inventory-transfers.service.js';

@Module({
  imports: [
    AuthModule,
    AccessControlModule,
    StockMovementsModule,
  ],
  controllers: [InventoryTransfersController],
  providers: [InventoryTransfersService],
})
export class InventoryTransfersModule {}
