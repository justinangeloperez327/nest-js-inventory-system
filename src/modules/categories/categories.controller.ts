import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermissions } from '../access-control/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../access-control/guards/permissions.guard.js';
import { Permission } from '../access-control/rbac.constants.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { CategoriesService } from './categories.service.js';
import { CategoryListQueryDto } from './dto/category-list-query.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { SetCategoryStatusDto } from './dto/set-category-status.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

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
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CategoriesManage)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.CategoriesManage)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCategoryStatusDto,
  ) {
    return this.categories.setStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CategoriesManage)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}
