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
import { CategoriesService } from './categories.service.js';
import { CategoryListQueryDto } from './dto/category-list-query.dto.js';
import { CategoryStatusDto } from './dto/category-status.dto.js';
import { CategoryUpsertDto } from './dto/category-upsert.dto.js';

@Controller('categories')
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(Permission.CategoriesRead)
  list(@Query() query: CategoryListQueryDto) {
    return this.categories.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.CategoriesRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.get(id);
  }

  @Post()
  @RequirePermissions(Permission.CategoriesManage)
  create(
    @Body() dto: CategoryUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.create(
      dto,
      user.id,
    );
  }

  @Put(':id')
  @RequirePermissions(Permission.CategoriesManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryUpsertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.update(
      id,
      dto,
      user.id,
    );
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.CategoriesManage)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.setStatus(
      id,
      dto,
      user.id,
    );
  }
}
