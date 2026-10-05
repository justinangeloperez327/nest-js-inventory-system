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
import type { WarehouseListQueryDto } from './dto/warehouse-list-query.dto.js';
import type { WarehouseStatusDto } from './dto/warehouse-status.dto.js';
import type { WarehouseUpsertDto } from './dto/warehouse-upsert.dto.js';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: WarehouseListQueryDto) {
    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();

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
                location: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [warehouses, totalItems] =
      await this.prisma.$transaction([
        this.prisma.warehouse.findMany({
          where,
          skip,
          take,
          orderBy: this.orderBy(
            query.sort,
            query.resolvedOrder,
          ),
        }),
        this.prisma.warehouse.count({ where }),
      ]);

    return toPaginatedResult(
      warehouses.map((warehouse) =>
        this.toWarehouse(warehouse),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const warehouse =
      await this.prisma.warehouse.findUnique({
        where: { id },
      });

    if (!warehouse) {
      throw this.notFound();
    }

    return this.toWarehouse(warehouse);
  }

  async create(dto: WarehouseUpsertDto) {
    await this.assertCodeAvailable(dto.code);

    try {
      const warehouse =
        await this.prisma.warehouse.create({
          data: {
            code: dto.code,
            name: dto.name,
            location: dto.location ?? null,
          },
        });

      return this.toWarehouse(warehouse);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: WarehouseUpsertDto,
  ) {
    await this.requireWarehouse(id);
    await this.assertCodeAvailable(dto.code, id);

    try {
      const warehouse =
        await this.prisma.warehouse.update({
          where: { id },
          data: {
            code: dto.code,
            name: dto.name,
            location: dto.location ?? null,
          },
        });

      return this.toWarehouse(warehouse);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async setStatus(
    id: string,
    dto: WarehouseStatusDto,
  ) {
    await this.requireWarehouse(id);

    if (!dto.active) {
      await this.assertCanDeactivate(id);
    }

    const warehouse =
      await this.prisma.warehouse.update({
        where: { id },
        data: { isActive: dto.active },
      });

    return this.toWarehouse(warehouse);
  }

  private async assertCanDeactivate(
    warehouseId: string,
  ): Promise<void> {
    const inventory =
      await this.prisma.inventoryItem.findFirst({
        where: {
          warehouseId,
          OR: [
            {
              quantityOnHand: {
                not: 0,
              },
            },
            {
              quantityReserved: {
                not: 0,
              },
            },
          ],
        },
        select: { id: true },
      });

    if (inventory) {
      throw new ConflictException({
        code: 'WAREHOUSE_HAS_STOCK',
        message:
          'Warehouse cannot be deactivated while it has on-hand or reserved inventory',
      });
    }
  }

  private async requireWarehouse(id: string) {
    const warehouse =
      await this.prisma.warehouse.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!warehouse) {
      throw this.notFound();
    }

    return warehouse;
  }

  private async assertCodeAvailable(
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const existing =
      await this.prisma.warehouse.findFirst({
        where: {
          code: {
            equals: code,
            mode: 'insensitive',
          },
          ...(excludeId
            ? { NOT: { id: excludeId } }
            : {}),
        },
        select: { id: true },
      });

    if (existing) {
      throw this.codeConflict();
    }
  }

  private rethrowUniqueConstraint(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    ) {
      throw this.codeConflict();
    }
  }

  private codeConflict(): ConflictException {
    return new ConflictException({
      code: 'WAREHOUSE_CODE_EXISTS',
      message:
        'A warehouse with this code already exists',
      fields: {
        code: ['Code must be unique.'],
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
      case 'location':
        return { location: order };
      case 'createdAt':
        return { createdAt: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for warehouses',
          statusCode: HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private toWarehouse(warehouse: {
    id: string;
    code: string;
    name: string;
    location: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      ...(warehouse.location
        ? { location: warehouse.location }
        : {}),
      active: warehouse.isActive,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'WAREHOUSE_NOT_FOUND',
      message: 'Warehouse was not found',
    });
  }
}
