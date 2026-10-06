import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { StockCountCreateDto } from './dto/stock-count-create.dto.js';
import { StockCountLineQueryDto } from './dto/stock-count-line-query.dto.js';
import { StockCountLinesUpdateDto } from './dto/stock-count-line-update.dto.js';
import { StockCountQueryDto } from './dto/stock-count-query.dto.js';
import { StockCountsService } from './stock-counts.service.js';

@Controller('stock-counts')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class StockCountsController {
  constructor(
    private readonly stockCounts: StockCountsService,
  ) {}

  @Get()
  @RequirePermissions(Permission.InventoryCount)
  list(@Query() query: StockCountQueryDto) {
    return this.stockCounts.list(query);
  }

  @Get('form-options')
  @RequirePermissions(Permission.InventoryCount)
  formOptions() {
    return this.stockCounts.formOptions();
  }

  @Get(':id')
  @RequirePermissions(Permission.InventoryCount)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockCounts.get(id);
  }

  @Get(':id/lines')
  @RequirePermissions(Permission.InventoryCount)
  getLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StockCountLineQueryDto,
  ) {
    return this.stockCounts.getLines(id, query);
  }

  @Post()
  @RequirePermissions(Permission.InventoryCount)
  create(
    @Body() dto: StockCountCreateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockCounts.create(dto, user.id);
  }

  @Post(':id/start')
  @RequirePermissions(Permission.InventoryCount)
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockCounts.start(id, user.id);
  }

  @Put(':id/lines')
  @RequirePermissions(Permission.InventoryCount)
  saveLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockCountLinesUpdateDto,
    @Query() query: StockCountLineQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockCounts.saveLines(
      id,
      dto,
      query,
      user.id,
    );
  }

  @Post(':id/submit')
  @RequirePermissions(Permission.InventoryCount)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockCounts.submit(id, user.id);
  }

  @Post(':id/approve-and-post')
  @RequirePermissions(
    Permission.InventoryCountApprove,
  )
  approveAndPost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockCounts.approveAndPost(
      id,
      user.id,
    );
  }
}
