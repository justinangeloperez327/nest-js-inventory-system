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
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { ProductListQueryDto } from './dto/product-list-query.dto.js';
import type { ProductStatusDto } from './dto/product-status.dto.js';
import type { ProductUpsertDto } from './dto/product-upsert.dto.js';

interface DecimalLike {
  toString(): string;
}

interface ProductRecord {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  unitId: string | null;
  costPrice: DecimalLike;
  sellingPrice: DecimalLike;
  reorderPoint: DecimalLike;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string } | null;
  unit: { id: string; name: string } | null;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(query: ProductListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();

    const where = {
      ...(query.categoryId
        ? { categoryId: query.categoryId }
        : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.active !== undefined
        ? { isActive: query.active }
        : {}),
      ...(search
        ? {
            OR: [
              {
                sku: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                barcode: {
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
            ],
          }
        : {}),
    };

    const [products, totalItems] =
      await this.prisma.$transaction([
        this.prisma.product.findMany({
          where,
          skip,
          take,
          orderBy: this.orderBy(
            query.sort,
            query.resolvedOrder,
          ),
          include: this.productInclude(),
        }),
        this.prisma.product.count({ where }),
      ]);

    return toPaginatedResult(
      products.map((product) =>
        this.toSummary(product as ProductRecord),
      ),
      totalItems,
      query,
    );
  }

  async formOptions() {
    const [categories, units] =
      await this.prisma.$transaction([
        this.prisma.category.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
        this.prisma.unit.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
      ]);

    return {
      categories,
      units,
      currencyCode:
        await this.settings.currencyCode(),
    };
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.productInclude(),
    });

    if (!product) {
      throw this.notFound();
    }

    return this.toDetail(
      product as ProductRecord,
      await this.settings.currencyCode(),
    );
  }

  async create(
    dto: ProductUpsertDto,
    userId: string,
  ) {
    await this.assertReferences(
      dto.categoryId,
      dto.unitId,
    );
    await this.assertIdentifiersAvailable(
      dto.sku,
      dto.barcode,
    );

    try {
      const product =
        await this.prisma.$transaction(
          async (tx) => {
            const created =
              await tx.product.create({
                data: {
                  sku: dto.sku,
                  barcode:
                    dto.barcode ?? null,
                  name: dto.name,
                  description:
                    dto.description ?? null,
                  categoryId:
                    dto.categoryId ?? null,
                  unitId:
                    dto.unitId ?? null,
                  costPrice:
                    dto.costPrice,
                  sellingPrice:
                    dto.sellingPrice,
                  reorderPoint:
                    dto.reorderLevel,
                },
                include:
                  this.productInclude(),
              });

            const after =
              this.toDetail(
                created as ProductRecord,
                await this.settings.currencyCodeInTransaction(
                  tx,
                ),
              );

            await this.audit.recordInTransaction(
              tx,
              {
                userId,
                action:
                  'product.created',
                entityType: 'product',
                entityId:
                  created.id,
                after,
              },
            );

            return created;
          },
        );

      return this.toDetail(
        product as ProductRecord,
        await this.settings.currencyCode(),
      );
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: ProductUpsertDto,
    userId: string,
  ) {
    const current = await this.prisma.product.findUnique({
      where: { id },
      select: {
        categoryId: true,
        unitId: true,
      },
    });

    if (!current) {
      throw this.notFound();
    }

    const before = await this.get(id);

    await this.assertReferences(
      dto.categoryId,
      dto.unitId,
      current,
    );
    await this.assertIdentifiersAvailable(
      dto.sku,
      dto.barcode,
      id,
    );

    try {
      const product =
        await this.prisma.$transaction(
          async (tx) => {
            const updated =
              await tx.product.update({
                where: { id },
                data: {
                  sku: dto.sku,
                  barcode:
                    dto.barcode ?? null,
                  name: dto.name,
                  description:
                    dto.description ?? null,
                  categoryId:
                    dto.categoryId ?? null,
                  unitId:
                    dto.unitId ?? null,
                  costPrice:
                    dto.costPrice,
                  sellingPrice:
                    dto.sellingPrice,
                  reorderPoint:
                    dto.reorderLevel,
                },
                include:
                  this.productInclude(),
              });

            const after =
              this.toDetail(
                updated as ProductRecord,
                await this.settings.currencyCodeInTransaction(
                  tx,
                ),
              );

            await this.audit.recordInTransaction(
              tx,
              {
                userId,
                action:
                  'product.updated',
                entityType: 'product',
                entityId: id,
                before,
                after,
              },
            );

            return updated;
          },
        );

      return this.toDetail(
      product as ProductRecord,
      await this.settings.currencyCode(),
    );
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async setStatus(
    id: string,
    dto: ProductStatusDto,
    userId: string,
  ) {
    const existing =
      await this.prisma.product.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!existing) {
      throw this.notFound();
    }

    const before = await this.get(id);

    const product =
      await this.prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.product.update({
              where: { id },
              data: {
                isActive:
                  dto.active,
              },
              include:
                this.productInclude(),
            });

          const after =
            this.toDetail(
              updated as ProductRecord,
            );

          await this.audit.recordInTransaction(
            tx,
            {
              userId,
              action:
                'product.status_changed',
              entityType: 'product',
              entityId: id,
              before,
              after,
            },
          );

          return updated;
        },
      );

    return this.toDetail(
      product as ProductRecord,
      await this.settings.currencyCode(),
    );
  }

  private async assertReferences(
    categoryId: string | undefined,
    unitId: string | undefined,
    current?: {
      categoryId: string | null;
      unitId: string | null;
    },
  ): Promise<void> {
    const [category, unit] = await Promise.all([
      categoryId
        ? this.prisma.category.findUnique({
            where: { id: categoryId },
            select: { id: true, isActive: true },
          })
        : Promise.resolve(null),
      unitId
        ? this.prisma.unit.findUnique({
            where: { id: unitId },
            select: { id: true, isActive: true },
          })
        : Promise.resolve(null),
    ]);

    if (
      categoryId &&
      (!category ||
        (!category.isActive &&
          categoryId !== current?.categoryId))
    ) {
      throw new ApiException({
        code: 'CATEGORY_UNAVAILABLE',
        message:
          'The selected category does not exist or is inactive',
        statusCode: HttpStatus.BAD_REQUEST,
        fields: {
          categoryId: [
            'Select an active category or leave the category empty.',
          ],
        },
      });
    }

    if (
      unitId &&
      (!unit ||
        (!unit.isActive &&
          unitId !== current?.unitId))
    ) {
      throw new ApiException({
        code: 'UNIT_UNAVAILABLE',
        message:
          'The selected unit does not exist or is inactive',
        statusCode: HttpStatus.BAD_REQUEST,
        fields: {
          unitId: [
            'Select an active unit or leave the unit empty.',
          ],
        },
      });
    }
  }

  private async assertIdentifiersAvailable(
    sku: string,
    barcode?: string,
    excludeId?: string,
  ): Promise<void> {
    const skuMatch =
      await this.prisma.product.findFirst({
        where: {
          sku: {
            equals: sku,
            mode: 'insensitive',
          },
          ...(excludeId
            ? { NOT: { id: excludeId } }
            : {}),
        },
        select: { id: true },
      });

    if (skuMatch) {
      throw this.skuConflict();
    }

    if (!barcode) {
      return;
    }

    const barcodeMatch =
      await this.prisma.product.findFirst({
        where: {
          barcode,
          ...(excludeId
            ? { NOT: { id: excludeId } }
            : {}),
        },
        select: { id: true },
      });

    if (barcodeMatch) {
      throw this.barcodeConflict();
    }
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

    const meta = (
      error as {
        meta?: {
          target?: unknown;
        };
      }
    ).meta;
    const target = meta?.target;
    const fields = Array.isArray(target)
      ? target.filter(
          (value): value is string =>
            typeof value === 'string',
        )
      : [];

    if (
      fields.some((field) =>
        field.toLowerCase().includes('barcode'),
      )
    ) {
      throw this.barcodeConflict();
    }

    throw this.skuConflict();
  }

  private skuConflict(): ConflictException {
    return new ConflictException({
      code: 'PRODUCT_SKU_EXISTS',
      message: 'A product with this SKU already exists',
      fields: {
        sku: ['SKU must be unique.'],
      },
    });
  }

  private barcodeConflict(): ConflictException {
    return new ConflictException({
      code: 'PRODUCT_BARCODE_EXISTS',
      message:
        'A product with this barcode already exists',
      fields: {
        barcode: ['Barcode must be unique.'],
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
      case 'sku':
        return { sku: order };
      case 'costPrice':
        return { costPrice: order };
      case 'sellingPrice':
        return { sellingPrice: order };
      case 'reorderLevel':
        return { reorderPoint: order };
      case 'createdAt':
        return { createdAt: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for products',
          statusCode: HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private productInclude() {
    return {
      category: {
        select: { id: true, name: true },
      },
      unit: {
        select: { id: true, name: true },
      },
    } as const;
  }

  private toSummary(product: ProductRecord) {
    return {
      id: product.id,
      sku: product.sku,
      ...(product.barcode
        ? { barcode: product.barcode }
        : {}),
      name: product.name,
      ...(product.categoryId
        ? { categoryId: product.categoryId }
        : {}),
      ...(product.category
        ? { categoryName: product.category.name }
        : {}),
      ...(product.unitId
        ? { unitId: product.unitId }
        : {}),
      ...(product.unit
        ? { unitName: product.unit.name }
        : {}),
      costPrice: Number(product.costPrice.toString()),
      sellingPrice: Number(
        product.sellingPrice.toString(),
      ),
      reorderLevel: Number(
        product.reorderPoint.toString(),
      ),
      active: product.isActive,
      updatedAt: product.updatedAt,
    };
  }

  private toDetail(
    product: ProductRecord,
    currencyCode: string,
  ) {
    return {
      ...this.toSummary(product),
      ...(product.description
        ? { description: product.description }
        : {}),
      currencyCode,
      createdAt: product.createdAt,
    };
  }


  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Product was not found',
    });
  }
}
