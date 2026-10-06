import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CustomerListQueryDto } from './dto/customer-list-query.dto.js';
import { CustomerStatusDto } from './dto/customer-status.dto.js';
import { CustomerUpsertDto } from './dto/customer-upsert.dto.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
  ) {}

  @Get()
  @RequirePermissions(Permission.CustomersRead)
  list(@Query() query: CustomerListQueryDto) {
    return this.customers.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.CustomersRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(id);
  }

  @Post()
  @RequirePermissions(Permission.CustomersManage)
  create(
    @Body() dto: CustomerUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.create(
      dto,
      user.id,
    );
  }

  @Put(':id')
  @RequirePermissions(Permission.CustomersManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.update(
      id,
      dto,
      user.id,
    );
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.CustomersManage)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.setStatus(
      id,
      dto,
      user.id,
    );
  }
}
