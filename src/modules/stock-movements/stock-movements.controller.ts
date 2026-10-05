import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto.js';
import { StockMovementsService } from './stock-movements.service.js';

@Controller('stock-movements')
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions(Permission.InventoryRead)
export class StockMovementsController {
  constructor(
    private readonly movements: StockMovementsService,
  ) {}

  @Get()
  list(@Query() query: StockMovementQueryDto) {
    return this.movements.list(query);
  }

  @Get('form-options')
  formOptions() {
    return this.movements.formOptions();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.movements.get(id);
  }
}
