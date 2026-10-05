import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
