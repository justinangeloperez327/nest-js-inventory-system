import {
  BadRequestException,
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
import { StockMovementsService } from '../stock-movements/stock-movements.service.js';
import type { InventoryAdjustmentProductQueryDto } from './dto/inventory-adjustment-product-query.dto.js';
import type { InventoryAdjustmentQueryDto } from './dto/inventory-adjustment-query.dto.js';
import type { InventoryAdjustmentUpsertDto } from './dto/inventory-adjustment-upsert.dto.js';
import {
  ADJUSTMENT_DIRECTION_FROM_DB,
  ADJUSTMENT_DIRECTION_TO_DB,
  ADJUSTMENT_STATUS_FROM_DB,
  ADJUSTMENT_STATUS_TO_DB,
  INVENTORY_ADJUSTMENT_REASONS,
  type InventoryAdjustmentDirection,
} from './inventory-adjustment.constants.js';

interface NumericValue {
  toString(): string;
}

interface AdjustmentSummaryRecord {
  id: string;
  number: string;
  productId: string;
  warehouseId: string;
  direction: string;
  quantity: NumericValue;
  reasonCode: string;
  notes: string | null;
  status: string;
  balanceBefore: NumericValue | null;
  balanceAfter: NumericValue | null;
  createdAt: Date;
  postedAt: Date | null;
  product: {
    sku: string;
    name: string;
    unit: {
      symbol: string;
    } | null;
  };
  warehouse: {
    code: string;
    name: string;
  };
}

interface AdjustmentDetailRecord extends AdjustmentSummaryRecord {
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  postedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  movement: {
    id: string;
  } | null;
}

interface SequenceRow {
  value: bigint;
}

interface LockedAdjustmentRow {
  id: string;
  status: string;
}

@Injectable()
export class InventoryAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: StockMovementsService,
  ) {}

  async list(query: InventoryAdjustmentQueryDto) {
    this.assertSort(query.sort);
    this.assertDateRange(query.dateFrom, query.dateTo);

    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();
    const dateFrom = this.resolveDateFrom(query.dateFrom);
    const dateTo = this.resolveDateToExclusive(query.dateTo);

    const where = {
      ...(query.warehouseId
        ? { warehouseId: query.warehouseId }
        : {}),
      ...(query.direction
        ? {
            direction:
              ADJUSTMENT_DIRECTION_TO_DB[query.direction],
          }
        : {}),
      ...(query.status
        ? { status: ADJUSTMENT_STATUS_TO_DB[query.status] }
        : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lt: dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                number: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                reasonCode: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                product: {
                  sku: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                product: {
                  name: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                warehouse: {
                  code: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                warehouse: {
                  name: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [adjustments, totalItems] =
      await this.prisma.$transaction([
        this.prisma.inventoryAdjustment.findMany({
          where,
          skip,
          take,
          orderBy: this.orderBy(
            query.sort,
            query.resolvedOrder,
          ),
          include: {
            product: {
              select: {
                sku: true,
                name: true,
                unit: {
                  select: { symbol: true },
                },
              },
            },
            warehouse: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        }),
        this.prisma.inventoryAdjustment.count({
          where,
        }),
      ]);

    return toPaginatedResult(
      adjustments.map((adjustment) =>
        this.toSummary(
          adjustment as AdjustmentSummaryRecord,
        ),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const adjustment =
      await this.prisma.inventoryAdjustment.findUnique({
        where: { id },
        include: {
          product: {
            select: {
              sku: true,
              name: true,
              unit: {
                select: { symbol: true },
              },
            },
          },
          warehouse: {
            select: {
              code: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          postedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          movement: {
            select: { id: true },
          },
        },
      });

    if (!adjustment) {
      throw this.notFound();
    }

    return this.toDetail(
      adjustment as AdjustmentDetailRecord,
    );
  }

  async formOptions() {
    const warehouses =
      await this.prisma.warehouse.findMany({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

    return {
      warehouses,
      reasons: INVENTORY_ADJUSTMENT_REASONS,
    };
  }

  async productOptions(
    query: InventoryAdjustmentProductQueryDto,
  ) {
    const search = query.search.trim();

    const products =
      await this.prisma.product.findMany({
        where: {
          isActive: true,
          isTrackable: true,
          OR: [
            {
              sku: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              barcode: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        },
        orderBy: [{ name: 'asc' }, { sku: 'asc' }],
        take: query.limit,
        select: {
          id: true,
          sku: true,
          name: true,
          unit: {
            select: { symbol: true },
          },
        },
      });

    return products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      ...(product.unit
        ? { unitSymbol: product.unit.symbol }
        : {}),
    }));
  }

  async create(
    dto: InventoryAdjustmentUpsertDto,
    userId: string,
  ) {
    await this.validateDraft(dto);

    const sequence =
      await this.prisma.$queryRawUnsafe<SequenceRow[]>(
        'SELECT nextval(\'inventory_adjustment_number_seq\') AS "value"',
      );
    const value = sequence[0]?.value;

    if (value === undefined) {
      throw new ConflictException({
        code: 'ADJUSTMENT_NUMBER_UNAVAILABLE',
        message:
          'Unable to allocate an inventory adjustment number',
      });
    }

    const number =
      'ADJ-' + value.toString().padStart(8, '0');

    const adjustment =
      await this.prisma.inventoryAdjustment.create({
        data: {
          number,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          direction:
            ADJUSTMENT_DIRECTION_TO_DB[dto.direction],
          quantity: dto.quantity,
          reasonCode: dto.reasonCode,
          notes: dto.notes ?? null,
          createdByUserId: userId,
        },
        select: { id: true },
      });

    return this.get(adjustment.id);
  }

  async update(
    id: string,
    dto: InventoryAdjustmentUpsertDto,
  ) {
    await this.validateDraft(dto);

    const result =
      await this.prisma.inventoryAdjustment.updateMany({
        where: {
          id,
          status: 'DRAFT',
        },
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          direction:
            ADJUSTMENT_DIRECTION_TO_DB[dto.direction],
          quantity: dto.quantity,
          reasonCode: dto.reasonCode,
          notes: dto.notes ?? null,
        },
      });

    if (result.count === 0) {
      const existing =
        await this.prisma.inventoryAdjustment.findUnique({
          where: { id },
          select: { status: true },
        });

      if (!existing) {
        throw this.notFound();
      }

      throw this.notDraft();
    }

    return this.get(id);
  }

  async post(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const locks =
        await tx.$queryRawUnsafe<LockedAdjustmentRow[]>(
          [
            'SELECT',
            '  "id"::text AS "id",',
            '  "status"::text AS "status"',
            'FROM "inventory_adjustments"',
            'WHERE "id" = $1::uuid',
            'FOR UPDATE',
          ].join('\n'),
          id,
        );

      const locked = locks[0];

      if (!locked) {
        throw this.notFound();
      }

      if (locked.status !== 'DRAFT') {
        throw this.notDraft();
      }

      const adjustment =
        await tx.inventoryAdjustment.findUnique({
          where: { id },
          include: {
            product: {
              select: {
                isActive: true,
                isTrackable: true,
              },
            },
            warehouse: {
              select: { isActive: true },
            },
          },
        });

      if (!adjustment) {
        throw this.notFound();
      }

      this.assertReason(
        this.directionFromDb(adjustment.direction),
        adjustment.reasonCode,
      );

      if (
        !adjustment.product.isActive ||
        !adjustment.product.isTrackable
      ) {
        throw new ConflictException({
          code: 'ADJUSTMENT_PRODUCT_NOT_ELIGIBLE',
          message:
            'The selected product is no longer active and trackable',
          fields: {
            productId: [
              'Select an active, trackable product.',
            ],
          },
        });
      }

      if (!adjustment.warehouse.isActive) {
        throw new ConflictException({
          code: 'ADJUSTMENT_WAREHOUSE_NOT_ELIGIBLE',
          message:
            'The selected warehouse is no longer active',
          fields: {
            warehouseId: [
              'Select an active warehouse.',
            ],
          },
        });
      }

      const direction =
        this.directionFromDb(adjustment.direction);
      const quantity = Number(
        adjustment.quantity.toString(),
      );
      const occurredAt = new Date();

      const movement =
        await this.movements.applyMovementInTransaction(
          tx,
          {
            productId: adjustment.productId,
            warehouseId: adjustment.warehouseId,
            type:
              direction === 'increase'
                ? 'adjustment-in'
                : 'adjustment-out',
            quantityChange:
              direction === 'increase'
                ? quantity
                : -quantity,
            reference: {
              type: 'inventory-adjustment',
              id: adjustment.id,
              number: adjustment.number,
              referencePath:
                '/adjustments/' + adjustment.id,
            },
            notes: adjustment.notes ?? undefined,
            performedByUserId: userId,
            occurredAt,
          },
        );

      await tx.inventoryAdjustment.update({
        where: { id },
        data: {
          status: 'POSTED',
          postedAt: occurredAt,
          postedByUserId: userId,
          movementId: movement.id,
          balanceBefore: movement.balanceBefore,
          balanceAfter: movement.balanceAfter,
        },
      });
    });

    return this.get(id);
  }

  private async validateDraft(
    dto: InventoryAdjustmentUpsertDto,
  ): Promise<void> {
    this.assertReason(dto.direction, dto.reasonCode);

    const [product, warehouse] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: {
          isActive: true,
          isTrackable: true,
        },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
        select: { isActive: true },
      }),
    ]);

    if (
      !product ||
      !product.isActive ||
      !product.isTrackable
    ) {
      throw new BadRequestException({
        code: 'ADJUSTMENT_PRODUCT_NOT_ELIGIBLE',
        message:
          'Adjustments require an active, trackable product',
        fields: {
          productId: [
            'Select an active, trackable product.',
          ],
        },
      });
    }

    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException({
        code: 'ADJUSTMENT_WAREHOUSE_NOT_ELIGIBLE',
        message:
          'Adjustments require an active warehouse',
        fields: {
          warehouseId: [
            'Select an active warehouse.',
          ],
        },
      });
    }
  }

  private assertReason(
    direction: InventoryAdjustmentDirection,
    reasonCode: string,
  ): void {
    const reason = INVENTORY_ADJUSTMENT_REASONS.find(
      (candidate) => candidate.code === reasonCode,
    );

    if (
      !reason ||
      (reason.direction &&
        reason.direction !== direction)
    ) {
      throw new BadRequestException({
        code: 'INVALID_ADJUSTMENT_REASON',
        message:
          'The selected adjustment reason is not valid for this direction',
        fields: {
          reasonCode: [
            'Select a valid reason for this adjustment direction.',
          ],
        },
      });
    }
  }

  private reasonLabel(code: string): string {
    return (
      INVENTORY_ADJUSTMENT_REASONS.find(
        (reason) => reason.code === code,
      )?.label ?? code
    );
  }

  private toSummary(
    adjustment: AdjustmentSummaryRecord,
  ) {
    return {
      id: adjustment.id,
      number: adjustment.number,
      productId: adjustment.productId,
      sku: adjustment.product.sku,
      productName: adjustment.product.name,
      ...(adjustment.product.unit
        ? {
            unitSymbol:
              adjustment.product.unit.symbol,
          }
        : {}),
      warehouseId: adjustment.warehouseId,
      warehouseCode: adjustment.warehouse.code,
      warehouseName: adjustment.warehouse.name,
      direction: this.directionFromDb(
        adjustment.direction,
      ),
      quantity: Number(
        adjustment.quantity.toString(),
      ),
      reasonCode: adjustment.reasonCode,
      reasonLabel: this.reasonLabel(
        adjustment.reasonCode,
      ),
      status: this.statusFromDb(adjustment.status),
      createdAt: adjustment.createdAt,
      ...(adjustment.postedAt
        ? { postedAt: adjustment.postedAt }
        : {}),
    };
  }

  private toDetail(
    adjustment: AdjustmentDetailRecord,
  ) {
    return {
      ...this.toSummary(adjustment),
      ...(adjustment.notes
        ? { notes: adjustment.notes }
        : {}),
      ...(adjustment.balanceBefore
        ? {
            balanceBefore: Number(
              adjustment.balanceBefore.toString(),
            ),
          }
        : {}),
      ...(adjustment.balanceAfter
        ? {
            balanceAfter: Number(
              adjustment.balanceAfter.toString(),
            ),
          }
        : {}),
      createdBy: this.actor(adjustment.createdBy),
      ...(adjustment.postedBy
        ? {
            postedBy: this.actor(
              adjustment.postedBy,
            ),
          }
        : {}),
      ...(adjustment.movement
        ? {
            movement: {
              id: adjustment.movement.id,
            },
          }
        : {}),
    };
  }

  private actor(user: {
    id: string;
    firstName: string;
    lastName: string;
  }) {
    return {
      id: user.id,
      name:
        user.firstName + ' ' + user.lastName,
    };
  }

  private directionFromDb(
    direction: string,
  ): InventoryAdjustmentDirection {
    const value =
      ADJUSTMENT_DIRECTION_FROM_DB[
        direction as keyof typeof ADJUSTMENT_DIRECTION_FROM_DB
      ];

    if (!value) {
      throw new Error(
        'Unsupported inventory adjustment direction: ' +
          direction,
      );
    }

    return value;
  }

  private statusFromDb(status: string) {
    const value =
      ADJUSTMENT_STATUS_FROM_DB[
        status as keyof typeof ADJUSTMENT_STATUS_FROM_DB
      ];

    if (!value) {
      throw new Error(
        'Unsupported inventory adjustment status: ' +
          status,
      );
    }

    return value;
  }

  private orderBy(
    sort: string | undefined,
    order: 'asc' | 'desc',
  ) {
    switch (sort) {
      case undefined:
      case 'createdAt':
        return { createdAt: order };
      case 'number':
        return { number: order };
      case 'productName':
        return { product: { name: order } };
      case 'warehouseName':
        return { warehouse: { name: order } };
      case 'direction':
        return { direction: order };
      case 'quantity':
        return { quantity: order };
      case 'status':
        return { status: order };
      case 'postedAt':
        return { postedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for inventory adjustments',
          statusCode: HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private assertSort(sort: string | undefined): void {
    if (
      sort !== undefined &&
      ![
        'createdAt',
        'number',
        'productName',
        'warehouseName',
        'direction',
        'quantity',
        'status',
        'postedAt',
      ].includes(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for inventory adjustments',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { sort },
      });
    }
  }

  private assertDateRange(
    dateFrom: string | undefined,
    dateTo: string | undefined,
  ): void {
    if (!dateFrom || !dateTo) {
      return;
    }

    const from = this.resolveDateFrom(dateFrom);
    const to = this.resolveDateToExclusive(dateTo);

    if (from && to && from >= to) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message:
          'dateFrom must be before or equal to dateTo',
      });
    }
  }

  private resolveDateFrom(
    value: string | undefined,
  ): Date | null {
    if (!value) {
      return null;
    }

    return new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value + 'T00:00:00.000Z'
        : value,
    );
  }

  private resolveDateToExclusive(
    value: string | undefined,
  ): Date | null {
    if (!value) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(
        value + 'T00:00:00.000Z',
      );
      date.setUTCDate(date.getUTCDate() + 1);
      return date;
    }

    return new Date(new Date(value).getTime() + 1);
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'INVENTORY_ADJUSTMENT_NOT_FOUND',
      message: 'Inventory adjustment was not found',
    });
  }

  private notDraft(): ConflictException {
    return new ConflictException({
      code: 'INVENTORY_ADJUSTMENT_NOT_DRAFT',
      message:
        'Only draft inventory adjustments can be changed or posted',
    });
  }
}
