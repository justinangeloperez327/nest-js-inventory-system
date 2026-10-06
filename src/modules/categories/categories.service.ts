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
import { prismaContainsSearch } from '../../common/utils/query-search.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CategoryListQueryDto } from './dto/category-list-query.dto.js';
import type { CategoryStatusDto } from './dto/category-status.dto.js';
import type { CategoryUpsertDto } from './dto/category-upsert.dto.js';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CategoryListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search =
      prismaContainsSearch(
        query.search,
      );

    const where = {
      ...(query.active !== undefined
        ? { isActive: query.active }
        : {}),
      ...(search
        ? {
            OR: [
              {
                code: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                name: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
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

    const [categories, totalItems] =
      await this.prisma.$transaction([
        this.prisma.category.findMany({
          where,
          skip,
          take,
          orderBy: [
            this.orderBy(
              query.sort,
              query.resolvedOrder,
            ),
            { id: 'asc' as const },
          ],
        }),
        this.prisma.category.count({ where }),
      ]);

    return toPaginatedResult(
      categories.map((category) =>
        this.toCategory(category),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const category =
      await this.prisma.category.findUnique({
        where: { id },
      });

    if (!category) {
      throw this.notFound();
    }

    return this.toCategory(category);
  }

  async create(
    dto: CategoryUpsertDto,
    userId: string,
  ) {
    await this.assertUnique(dto.code, dto.name);

    try {
      const category =
        await this.prisma.$transaction(
          async (tx) => {
            const created =
              await tx.category.create({
                data: {
                  code: dto.code,
                  name: dto.name,
                  description:
                    dto.description ?? null,
                },
              });

            const after =
              this.toCategory(created);

            await this.audit.recordInTransaction(
              tx,
              {
                userId,
                action:
                  'category.created',
                entityType:
                  'category',
                entityId:
                  created.id,
                after,
              },
            );

            return created;
          },
        );

      return this.toCategory(category);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: CategoryUpsertDto,
    userId: string,
  ) {
    await this.requireCategory(id);
    const before = await this.get(id);
    await this.assertUnique(
      dto.code,
      dto.name,
      id,
    );

    try {
      const category =
        await this.prisma.$transaction(
          async (tx) => {
            const updated =
              await tx.category.update({
                where: { id },
                data: {
                  code: dto.code,
                  name: dto.name,
                  description:
                    dto.description ?? null,
                },
              });

            const after =
              this.toCategory(updated);

            await this.audit.recordInTransaction(
              tx,
              {
                userId,
                action:
                  'category.updated',
                entityType:
                  'category',
                entityId: id,
                before,
                after,
              },
            );

            return updated;
          },
        );

      return this.toCategory(category);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async setStatus(
    id: string,
    dto: CategoryStatusDto,
    userId: string,
  ) {
    await this.requireCategory(id);
    const before = await this.get(id);

    const category =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.category.update({
              where: { id },
              data: {
                isActive: dto.active,
              },
            });

          const after =
            this.toCategory(updated);

          await this.audit.recordInTransaction(
            tx,
            {
              userId,
              action:
                'category.status_changed',
              entityType: 'category',
              entityId: id,
              before,
              after,
            },
          );

          return updated;
        },
      );

    return this.toCategory(category);
  }

  private async requireCategory(id: string) {
    const category =
      await this.prisma.category.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!category) {
      throw this.notFound();
    }

    return category;
  }

  private async assertUnique(
    code: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing =
      await this.prisma.category.findFirst({
        where: {
          OR: [
            {
              code: {
                equals: code,
                mode: 'insensitive',
              },
            },
            {
              name: {
                equals: name,
                mode: 'insensitive',
              },
            },
          ],
          ...(excludeId
            ? { NOT: { id: excludeId } }
            : {}),
        },
        select: {
          code: true,
          name: true,
        },
      });

    if (!existing) {
      return;
    }

    if (
      existing.code.toLocaleLowerCase() ===
      code.toLocaleLowerCase()
    ) {
      throw this.codeConflict();
    }

    throw this.nameConflict();
  }

  private rethrowUniqueConstraint(error: unknown): void {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      (error as { code?: unknown }).code !== 'P2002'
    ) {
      return;
    }

    const target = (
      error as {
        meta?: { target?: unknown };
      }
    ).meta?.target;
    const fields = Array.isArray(target)
      ? target.filter(
          (value): value is string =>
            typeof value === 'string',
        )
      : [];

    if (
      fields.some((field) =>
        field.toLowerCase().includes('code'),
      )
    ) {
      throw this.codeConflict();
    }

    throw this.nameConflict();
  }

  private codeConflict(): ConflictException {
    return new ConflictException({
      code: 'CATEGORY_CODE_EXISTS',
      message:
        'A category with this code already exists',
      fields: {
        code: ['Code must be unique.'],
      },
    });
  }

  private nameConflict(): ConflictException {
    return new ConflictException({
      code: 'CATEGORY_NAME_EXISTS',
      message:
        'A category with this name already exists',
      fields: {
        name: ['Name must be unique.'],
      },
    });
  }

  private orderBy(
    sort: string | undefined,
    order: 'asc' | 'desc',
  ) {
    switch (sort) {
      case undefined:
      case 'name':
        return { name: order };
      case 'code':
        return { code: order };
      case 'createdAt':
        return { createdAt: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for categories',
          statusCode: HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private toCategory(category: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      ...(category.description
        ? { description: category.description }
        : {}),
      active: category.isActive,
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
