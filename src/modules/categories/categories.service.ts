import {
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ApiException } from '../../common/exceptions/api.exception.js';
import {
  toPaginatedResult,
  toPaginationWindow,
} from '../../common/utils/pagination.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { CategoryListQueryDto } from './dto/category-list-query.dto.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { SetCategoryStatusDto } from './dto/set-category-status.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CategoryListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();

    const where = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              {
                description: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const orderBy = this.orderBy(query.sort, query.order);

    const [categories, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          _count: {
            select: { products: true },
          },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    return toPaginatedResult(
      categories.map((category) => this.toCategory(category)),
      total,
      query,
    );
  }

  async get(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw this.notFound();
    }

    return this.toCategory(category);
  }

  async create(dto: CreateCategoryDto) {
    await this.assertNameAvailable(dto.name);

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description || null,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return this.toCategory(category);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.requireCategory(id);

    if (
      dto.name !== undefined &&
      dto.name.toLocaleLowerCase() !== current.name.toLocaleLowerCase()
    ) {
      await this.assertNameAvailable(dto.name, id);
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description || null }
          : {}),
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return this.toCategory(category);
  }

  async setStatus(id: string, dto: SetCategoryStatusDto) {
    await this.requireCategory(id);

    const category = await this.prisma.category.update({
      where: { id },
      data: { isActive: dto.isActive },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return this.toCategory(category);
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.requireCategory(id);

    const productCount = await this.prisma.product.count({
      where: { categoryId: id },
    });

    if (productCount > 0) {
      throw new ConflictException({
        code: 'CATEGORY_IN_USE',
        message:
          'Category cannot be deleted while products reference it; deactivate it instead',
      });
    }

    await this.prisma.category.delete({ where: { id } });

    return { deleted: true };
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
      },
    });

    if (!category) {
      throw this.notFound();
    }

    return category;
  }

  private async assertNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CATEGORY_NAME_EXISTS',
        message: 'A category with this name already exists',
      });
    }
  }

  private orderBy(sort: string | undefined, order: 'asc' | 'desc') {
    switch (sort) {
      case undefined:
      case 'name':
        return { name: order };
      case 'createdAt':
        return { createdAt: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message: 'Unsupported sort field for categories',
          statusCode: HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private toCategory(category: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: { products: number };
  }) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      productCount: category._count.products,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'CATEGORY_NOT_FOUND',
      message: 'Category was not found',
    });
  }
}
