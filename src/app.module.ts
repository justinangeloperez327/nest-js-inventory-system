import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appConfig from './config/app.config.js';
import authConfig from './config/auth.config.js';
import databaseConfig from './config/database.config.js';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { GoodsReceiptsModule } from './modules/goods-receipts/goods-receipts.module.js';
import { AccessControlModule } from './modules/access-control/access-control.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { InventoryAdjustmentsModule } from './modules/inventory-adjustments/inventory-adjustments.module.js';
import { InventoryTransfersModule } from './modules/inventory-transfers/inventory-transfers.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module.js';
import { SalesOrdersModule } from './modules/sales-orders/sales-orders.module.js';
import { StockMovementsModule } from './modules/stock-movements/stock-movements.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { UnitsModule } from './modules/units/units.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WarehousesModule } from './modules/warehouses/warehouses.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
      load: [appConfig, authConfig, databaseConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    AccessControlModule,
    UsersModule,
    CategoriesModule,
    CustomersModule,
    UnitsModule,
    ProductsModule,
    WarehousesModule,
    InventoryModule,
    StockMovementsModule,
    InventoryAdjustmentsModule,
    InventoryTransfersModule,
    SuppliersModule,
    PurchaseOrdersModule,
    GoodsReceiptsModule,
    SalesOrdersModule,
    HealthModule,
  ],
})
export class AppModule {}
