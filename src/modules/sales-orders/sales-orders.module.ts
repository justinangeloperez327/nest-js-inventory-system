import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StockMovementsModule } from '../stock-movements/stock-movements.module.js';
import { SalesOrdersController } from './sales-orders.controller.js';
import { SalesOrdersService } from './sales-orders.service.js';

@Module({
  imports: [
    AuthModule,
    AccessControlModule,
    StockMovementsModule,
  ],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}
