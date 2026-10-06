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
import {
  assertDateOnlyQueryRange,
  dateOnlyToExclusive,
  parseDateOnlyQuery,
} from '../../common/utils/query-date.util.js';
import { prismaContainsSearch } from '../../common/utils/query-search.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { StockMovementsService } from '../stock-movements/stock-movements.service.js';
import type { SalesOrderLookupQueryDto } from './dto/sales-order-lookup-query.dto.js';
import type { SalesOrderProductQueryDto } from './dto/sales-order-product-query.dto.js';
import type { SalesOrderQueryDto } from './dto/sales-order-query.dto.js';
import type {
  SalesOrderLineDto,
  SalesOrderUpsertDto,
} from './dto/sales-order-upsert.dto.js';
import type { SalesReturnDto } from './dto/sales-return.dto.js';
import {
  SALES_ORDER_STATUS_FROM_DB,
  SALES_ORDER_STATUS_TO_DB,
} from './sales-order.constants.js';

interface DecimalLike {
  toString(): string;
}

interface SequenceRow {
  value: bigint;
}

interface LockedOrderRow {
  status: string;
}

interface CalculatedLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

interface ReserveResultRow {
  quantityReserved: string;
}

interface SalesOrderSummaryRecord {
  id: string;
  number: string;
  customerId: string;
  warehouseId: string;
  orderDate: Date;
  status: string;
  subtotal: DecimalLike;
  currencyCode: string;
  createdAt: Date;
  confirmedAt: Date | null;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  customer: {
    code: string;
    name: string;
  };
  warehouse: {
    code: string;
    name: string;
  };
  _count: {
    lines: number;
  };
}

interface SalesOrderDetailRecord
  extends SalesOrderSummaryRecord {
  notes: string | null;
  createdBy: ActorRecord;
  confirmedBy: ActorRecord | null;
  dispatchedBy: ActorRecord | null;
  completedBy: ActorRecord | null;
  lines: SalesOrderLineRecord[];
  returns: SalesReturnRecord[];
}

interface ActorRecord {
  id: string;
  firstName: string;
  lastName: string;
}

interface SalesOrderLineRecord {
  id: string;
  productId: string;
  quantity: DecimalLike;
  unitPrice: DecimalLike;
  lineTotal: DecimalLike;
  quantityReserved: DecimalLike;
  quantityDispatched: DecimalLike;
  quantityReturned: DecimalLike;
  product: {
    sku: string;
    name: string;
    unit: {
      symbol: string;
    } | null;
  };
  saleMovement: {
    id: string;
    referenceNumber: string | null;
    unitCost: DecimalLike | null;
  } | null;
}

interface SalesReturnRecord {
  id: string;
  number: string;
  createdAt: Date;
  createdBy: ActorRecord;
  lines: Array<{
    id: string;
    salesOrderLineId: string;
    quantityReturned: DecimalLike;
    salesOrderLine: {
      productId: string;
      product: {
        sku: string;
        name: string;
        unit: {
          symbol: string;
        } | null;
      };
    };
    movement: {
      id: string;
      referenceNumber: string | null;
    };
  }>;
}

const MAX_DECIMAL_19_4_SCALED =
  9_999_999_999_999_999_999n;

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly movements: StockMovementsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: SalesOrderQueryDto) {
    this.assertSort(query.sort);
    assertDateOnlyQueryRange(
      query.dateFrom,
      query.dateTo,
    );

    const { skip, take } =
      toPaginationWindow(query);
    const search =
      prismaContainsSearch(
        query.search,
      );
    const dateFrom = query.dateFrom
      ? parseDateOnlyQuery(
          query.dateFrom,
          'dateFrom',
        )
      : null;
    const dateTo =
      dateOnlyToExclusive(
        query.dateTo,
        'dateTo',
      );

    const where = {
      ...(query.customerId
        ? { customerId: query.customerId }
        : {}),
      ...(query.warehouseId
        ? { warehouseId: query.warehouseId }
        : {}),
      ...(query.status
        ? {
            status:
              SALES_ORDER_STATUS_TO_DB[
                query.status
              ],
          }
        : {}),
      ...(dateFrom || dateTo
        ? {
            orderDate: {
              ...(dateFrom
                ? { gte: dateFrom }
                : {}),
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
                customer: {
                  code: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                customer: {
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
              {
                lines: {
                  some: {
                    product: {
                      OR: [
                        {
                          sku: {
                            contains: search,
                            mode:
                              'insensitive' as const,
                          },
                        },
                        {
                          name: {
                            contains: search,
                            mode:
                              'insensitive' as const,
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, totalItems] =
      await this.prisma.$transaction([
        this.prisma.salesOrder.findMany({
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
          include: {
            customer: {
              select: {
                code: true,
                name: true,
              },
            },
            warehouse: {
              select: {
                code: true,
                name: true,
              },
            },
            _count: {
              select: { lines: true },
            },
          },
        }),
        this.prisma.salesOrder.count({
          where,
        }),
      ]);

    return toPaginatedResult(
      items.map((item) =>
        this.toSummary(
          item as SalesOrderSummaryRecord,
        ),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const item =
      await this.prisma.salesOrder.findUnique({
        where: { id },
        include: {
          customer: {
            select: {
              code: true,
              name: true,
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
          confirmedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          dispatchedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          completedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          lines: {
            orderBy: [
              { product: { name: 'asc' } },
              { id: 'asc' },
            ],
            include: {
              product: {
                select: {
                  sku: true,
                  name: true,
                  unit: {
                    select: {
                      symbol: true,
                    },
                  },
                },
              },
              saleMovement: {
                select: {
                  id: true,
                  referenceNumber: true,
                  unitCost: true,
                },
              },
            },
          },
          returns: {
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              createdBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
              lines: {
                include: {
                  salesOrderLine: {
                    select: {
                      productId: true,
                      product: {
                        select: {
                          sku: true,
                          name: true,
                          unit: {
                            select: {
                              symbol: true,
                            },
                          },
                        },
                      },
                    },
                  },
                  movement: {
                    select: {
                      id: true,
                      referenceNumber: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: { lines: true },
          },
        },
      });

    if (!item) {
      throw this.notFound();
    }

    return this.toDetail(
      item as SalesOrderDetailRecord,
    );
  }

  async formOptions() {
    const warehouses =
      await this.prisma.warehouse.findMany({
        where: { isActive: true },
        orderBy: [
          { name: 'asc' },
          { code: 'asc' },
        ],
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

    return {
      warehouses,
      currencyCode:
        await this.settings.currencyCode(),
    };
  }

  async customerOptions(
    query: SalesOrderLookupQueryDto,
  ) {
    const search =
      prismaContainsSearch(
        query.search,
      )!;

    return this.prisma.customer.findMany({
      where: {
        isActive: true,
        OR: [
          {
            code: {
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
            contactName: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: [
        { name: 'asc' },
        { code: 'asc' },
      ],
      take: query.limit,
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }

  async customerOption(customerId: string) {
    const customer =
      await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      });

    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer was not found',
      });
    }

    if (!customer.isActive) {
      throw new ConflictException({
        code: 'SALES_CUSTOMER_UNAVAILABLE',
        message:
          'Inactive customers cannot be selected for new sales orders',
      });
    }

    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
    };
  }

  async productOptions(
    query: SalesOrderProductQueryDto,
  ) {
    const warehouse =
      await this.prisma.warehouse.findUnique({
        where: {
          id: query.warehouseId,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException({
        code: 'SALES_WAREHOUSE_UNAVAILABLE',
        message:
          'Product lookup requires an active fulfillment warehouse',
        fields: {
          warehouseId: [
            'Select an active warehouse.',
          ],
        },
      });
    }

    const search =
      prismaContainsSearch(
        query.search,
      )!;
    const balances =
      await this.prisma.inventoryItem.findMany({
        where: {
          warehouseId: query.warehouseId,
          product: {
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
        },
        orderBy: {
          product: {
            name: 'asc',
          },
        },
        take: query.limit,
        select: {
          quantityOnHand: true,
          quantityReserved: true,
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              sellingPrice: true,
              unit: {
                select: {
                  symbol: true,
                },
              },
            },
          },
        },
      });

    return balances.map((balance) => ({
      id: balance.product.id,
      sku: balance.product.sku,
      name: balance.product.name,
      ...(balance.product.unit
        ? {
            unitSymbol:
              balance.product.unit.symbol,
          }
        : {}),
      quantityAvailable:
        Number(
          balance.quantityOnHand.toString(),
        ) -
        Number(
          balance.quantityReserved.toString(),
        ),
      defaultUnitPrice: Number(
        balance.product.sellingPrice.toString(),
      ),
    }));
  }

  async create(
    dto: SalesOrderUpsertDto,
    userId: string,
  ) {
    const id = await this.prisma.$transaction(
      async (tx) => {
        const prepared =
          await this.prepareDraft(tx, dto);

        const sequence =
          await tx.$queryRawUnsafe<
            SequenceRow[]
          >(
            'SELECT nextval(\'sales_order_number_seq\') AS "value"',
          );
        const value = sequence[0]?.value;

        if (value === undefined) {
          throw new ConflictException({
            code: 'SALES_ORDER_NUMBER_UNAVAILABLE',
            message:
              'Unable to allocate a sales order number',
          });
        }

        const number =
          'SO-' +
          value.toString().padStart(8, '0');

        const item =
          await tx.salesOrder.create({
            data: {
              number,
              customerId: dto.customerId,
              warehouseId:
                dto.warehouseId,
              orderDate:
                prepared.orderDate,
              notes: dto.notes ?? null,
              subtotal: prepared.subtotal,
              currencyCode:
                await this.settings.currencyCodeInTransaction(
                  tx,
                ),
              createdByUserId: userId,
              lines: {
                create:
                  prepared.lines.map(
                    (line) => ({
                      productId:
                        line.productId,
                      quantity:
                        line.quantity,
                      unitPrice:
                        line.unitPrice,
                      lineTotal:
                        line.lineTotal,
                    }),
                  ),
              },
            },
            select: {
              id: true,
              number: true,
              customerId: true,
              warehouseId: true,
              orderDate: true,
              notes: true,
              subtotal: true,
              currencyCode: true,
              status: true,
            },
          });

        await this.audit.recordInTransaction(
          tx,
          {
            userId,
            action:
              'sales-order.created',
            entityType:
              'sales-order',
            entityId: item.id,
            after: {
              ...item,
              lines: prepared.lines,
            },
          },
        );

        return item.id;
      },
    );

    return this.get(id);
  }

  async update(
    id: string,
    dto: SalesOrderUpsertDto,
    userId: string,
  ) {
    const before = await this.get(id);

    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'DRAFT',
        );

        const prepared =
          await this.prepareDraft(tx, dto);

        await tx.salesOrder.update({
          where: { id },
          data: {
            customerId: dto.customerId,
            warehouseId:
              dto.warehouseId,
            orderDate: prepared.orderDate,
            notes: dto.notes ?? null,
            subtotal: prepared.subtotal,
          },
        });

        await tx.salesOrderLine.deleteMany({
          where: { salesOrderId: id },
        });

        await tx.salesOrderLine.createMany({
          data: prepared.lines.map(
            (line) => ({
              salesOrderId: id,
              productId:
                line.productId,
              quantity: line.quantity,
              unitPrice:
                line.unitPrice,
              lineTotal:
                line.lineTotal,
            }),
          ),
        });

        await this.audit.recordInTransaction(
          tx,
          {
            userId,
            action:
              'sales-order.updated',
            entityType:
              'sales-order',
            entityId: id,
            before,
            after: {
              customerId:
                dto.customerId,
              warehouseId:
                dto.warehouseId,
              orderDate:
                prepared.orderDate,
              notes:
                dto.notes ?? null,
              subtotal:
                prepared.subtotal,
              status: 'draft',
              lines: prepared.lines,
            },
          },
        );
      },
    );

    return this.get(id);
  }

  async confirm(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'DRAFT',
        );

        const order =
          await this.requireOperationalOrder(
            tx,
            id,
          );

        await this.movements.assertWarehousesMovementAllowedInTransaction(
          tx,
          [order.warehouseId],
        );

        const confirmedAt = new Date();

        await tx.salesOrder.update({
          where: { id },
          data: {
            status: 'CONFIRMED',
            confirmedAt,
            confirmedByUserId: userId,
          },
        });

        const sortedLines = [
          ...order.lines,
        ].sort((a, b) =>
          a.productId.localeCompare(
            b.productId,
          ),
        );

        await this.acquireInventoryLocks(
          tx,
          sortedLines.map(
            (line) => line.productId,
          ),
          order.warehouseId,
        );

        for (const line of sortedLines) {
          const quantity =
            line.quantity.toString();

          const rows =
            await tx.$queryRawUnsafe<
              ReserveResultRow[]
            >(
              [
                'UPDATE "inventory_items"',
                'SET',
                '  "quantity_reserved" = "quantity_reserved" + $3::numeric(19,4),',
                '  "updated_at" = NOW()',
                'WHERE "product_id" = $1::uuid',
                '  AND "warehouse_id" = $2::uuid',
                '  AND ("quantity_on_hand" - "quantity_reserved") >= $3::numeric(19,4)',
                'RETURNING "quantity_reserved"::text AS "quantityReserved"',
              ].join('\n'),
              line.productId,
              order.warehouseId,
              quantity,
            );

          if (!rows[0]) {
            throw new ConflictException({
              code:
                'SALES_INSUFFICIENT_AVAILABLE_STOCK',
              message:
                'The sales order cannot be fully reserved with current available stock',
              details: {
                productId:
                  line.productId,
                required: Number(quantity),
              },
            });
          }

          await tx.salesOrderLine.update({
            where: { id: line.id },
            data: {
              quantityReserved:
                line.quantity,
            },
          });
        }

        await this.audit.recordInTransaction(
          tx,
          {
            userId,
            action:
              'sales-order.confirmed',
            entityType:
              'sales-order',
            entityId: id,
            before: {
              status: 'draft',
            },
            after: {
              status: 'confirmed',
              confirmedAt,
              reservedLineCount:
                order.lines.length,
            },
          },
        );
      },
    );

    return this.get(id);
  }

  async cancel(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'CONFIRMED',
        );

        const order =
          await tx.salesOrder.findUnique({
            where: { id },
            include: {
              lines: true,
            },
          });

        if (!order) {
          throw this.notFound();
        }

        const sortedLines = [
          ...order.lines,
        ].sort((a, b) =>
          a.productId.localeCompare(
            b.productId,
          ),
        );

        await this.acquireInventoryLocks(
          tx,
          sortedLines.map(
            (line) => line.productId,
          ),
          order.warehouseId,
        );

        for (const line of sortedLines) {
          const reserved =
            line.quantityReserved.toString();

          const released =
            await tx.$executeRawUnsafe(
              [
                'UPDATE "inventory_items"',
                'SET',
                '  "quantity_reserved" = "quantity_reserved" - $3::numeric(19,4),',
                '  "updated_at" = NOW()',
                'WHERE "product_id" = $1::uuid',
                '  AND "warehouse_id" = $2::uuid',
                '  AND "quantity_reserved" >= $3::numeric(19,4)',
              ].join('\n'),
              line.productId,
              order.warehouseId,
              reserved,
            );

          if (released !== 1) {
            throw new ConflictException({
              code:
                'SALES_RESERVATION_INCONSISTENT',
              message:
                'The sales reservation could not be released safely',
              details: {
                productId:
                  line.productId,
              },
            });
          }

          await tx.salesOrderLine.update({
            where: { id: line.id },
            data: {
              quantityReserved: 0,
            },
          });
        }

        const cancelledAt = new Date();

        await tx.salesOrder.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt,
            cancelledByUserId: userId,
          },
        });

        await this.audit.recordInTransaction(
          tx,
          {
            userId,
            action:
              'sales-order.cancelled',
            entityType:
              'sales-order',
            entityId: id,
            before: {
              status: 'confirmed',
            },
            after: {
              status: 'cancelled',
              cancelledAt,
              releasedLineCount:
                order.lines.length,
            },
          },
        );
      },
    );

    return this.get(id);
  }

  async dispatch(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'CONFIRMED',
        );

        const order =
          await tx.salesOrder.findUnique({
            where: { id },
            include: {
              warehouse: {
                select: {
                  isActive: true,
                },
              },
              lines: true,
            },
          });

        if (!order) {
          throw this.notFound();
        }

        if (!order.warehouse.isActive) {
          throw new ConflictException({
            code:
              'SALES_WAREHOUSE_UNAVAILABLE',
            message:
              'The fulfillment warehouse is inactive and cannot dispatch stock',
          });
        }

        const sortedLines = [
          ...order.lines,
        ].sort((a, b) =>
          a.productId.localeCompare(
            b.productId,
          ),
        );

        await this.acquireInventoryLocks(
          tx,
          sortedLines.map(
            (line) => line.productId,
          ),
          order.warehouseId,
        );

        const occurredAt = new Date();

        for (const line of sortedLines) {
          const quantityText =
            line.quantity.toString();
          const quantity = Number(
            quantityText,
          );
          const reserved =
            this.parseScaled4(
              line.quantityReserved.toString(),
            );
          const ordered =
            this.parseScaled4(
              quantityText,
            );
          const dispatched =
            this.parseScaled4(
              line.quantityDispatched.toString(),
            );

          if (
            reserved !== ordered ||
            dispatched !== 0n
          ) {
            throw new ConflictException({
              code:
                'SALES_RESERVATION_INCONSISTENT',
              message:
                'Sales order reservation does not match the dispatch quantity',
              details: {
                productId:
                  line.productId,
              },
            });
          }

          const movement =
            await this.movements.applyReservedSaleInTransaction(
              tx,
              {
                productId:
                  line.productId,
                warehouseId:
                  order.warehouseId,
                quantity,
                reference: {
                  type: 'sales-order',
                  id: order.id,
                  number: order.number,
                  referencePath:
                    '/sales/' + order.id,
                },
                notes:
                  order.notes ?? undefined,
                performedByUserId: userId,
                occurredAt,
              },
            );

          await tx.salesOrderLine.update({
            where: { id: line.id },
            data: {
              quantityReserved: 0,
              quantityDispatched:
                line.quantity,
              saleMovementId:
                movement.id,
            },
          });
        }

        await tx.salesOrder.update({
          where: { id },
          data: {
            status: 'DISPATCHED',
            dispatchedAt: occurredAt,
            dispatchedByUserId: userId,
          },
        });

        await this.audit.recordInTransaction(
          tx,
          {
            userId,
            action:
              'sales-order.dispatched',
            entityType:
              'sales-order',
            entityId: id,
            before: {
              status: 'confirmed',
            },
            after: {
              status: 'dispatched',
              dispatchedAt:
                occurredAt,
              dispatchedLineCount:
                order.lines.length,
            },
          },
        );
      },
    );

    return this.get(id);
  }

  async complete(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'DISPATCHED',
        );

        const completedAt = new Date();

        await tx.salesOrder.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt,
            completedByUserId: userId,
          },
        });

        await this.audit.recordInTransaction(
          tx,
          {
            userId,
            action:
              'sales-order.completed',
            entityType:
              'sales-order',
            entityId: id,
            before: {
              status: 'dispatched',
            },
            after: {
              status: 'completed',
              completedAt,
            },
          },
        );
      },
    );

    return this.get(id);
  }

  async createReturn(
    id: string,
    dto: SalesReturnDto,
    userId: string,
  ) {
    const returnId =
      await this.prisma.$transaction(
        async (tx) => {
          const locks =
            await tx.$queryRawUnsafe<
              LockedOrderRow[]
            >(
              [
                'SELECT "status"::text AS "status"',
                'FROM "sales_orders"',
                'WHERE "id" = $1::uuid',
                'FOR UPDATE',
              ].join('\n'),
              id,
            );

          const lock = locks[0];

          if (!lock) {
            throw this.notFound();
          }

          if (
            lock.status !== 'DISPATCHED' &&
            lock.status !== 'COMPLETED'
          ) {
            throw new ConflictException({
              code:
                'SALES_ORDER_NOT_RETURNABLE',
              message:
                'Returns are allowed only for dispatched or completed sales orders',
            });
          }

          const duplicate =
            this.findDuplicateReturnLine(
              dto.lines,
            );

          if (duplicate) {
            throw new BadRequestException({
              code:
                'SALES_RETURN_DUPLICATE_LINE',
              message:
                'A sales-order line can appear only once in a return',
              fields: {
                lines: [
                  'Remove duplicate sales-order lines.',
                ],
              },
              details: {
                salesOrderLineId:
                  duplicate,
              },
            });
          }

          const order =
            await tx.salesOrder.findUnique({
              where: { id },
              include: {
                warehouse: {
                  select: {
                    isActive: true,
                  },
                },
                lines: {
                  include: {
                    saleMovement: {
                      select: {
                        unitCost: true,
                      },
                    },
                  },
                },
              },
            });

          if (!order) {
            throw this.notFound();
          }

          if (!order.warehouse.isActive) {
            throw new ConflictException({
              code:
                'SALES_RETURN_WAREHOUSE_UNAVAILABLE',
              message:
                'The original fulfillment warehouse is inactive and cannot receive a return',
            });
          }

          const lineById = new Map(
            order.lines.map(
              (line) =>
                [line.id, line] as const,
            ),
          );

          const prepared = dto.lines.map(
            (request) => {
              const line = lineById.get(
                request.salesOrderLineId,
              );

              if (!line) {
                throw new BadRequestException({
                  code:
                    'SALES_RETURN_LINE_NOT_ON_ORDER',
                  message:
                    'A return line does not belong to this sales order',
                  fields: {
                    lines: [
                      'Select lines from this sales order.',
                    ],
                  },
                  details: {
                    salesOrderLineId:
                      request.salesOrderLineId,
                  },
                });
              }

              const dispatched =
                this.parseScaled4(
                  line.quantityDispatched.toString(),
                );
              const returned =
                this.parseScaled4(
                  line.quantityReturned.toString(),
                );
              const requested =
                this.toScaled4(
                  request.quantity,
                );
              const returnable =
                dispatched - returned;

              if (
                requested.scaled >
                returnable
              ) {
                throw new ConflictException({
                  code:
                    'SALES_RETURN_EXCEEDS_RETURNABLE',
                  message:
                    'Return quantity exceeds the remaining returnable quantity',
                  details: {
                    salesOrderLineId:
                      request.salesOrderLineId,
                    returnable: Number(
                      this.formatScaled4(
                        returnable < 0n
                          ? 0n
                          : returnable,
                      ),
                    ),
                  },
                });
              }

              if (!line.saleMovement) {
                throw new ConflictException({
                  code:
                    'SALES_RETURN_MOVEMENT_MISSING',
                  message:
                    'The original sale movement is unavailable for this return',
                  details: {
                    salesOrderLineId:
                      line.id,
                  },
                });
              }

              return {
                line,
                quantity:
                  requested.text,
              };
            },
          );

          const sequence =
            await tx.$queryRawUnsafe<
              SequenceRow[]
            >(
              'SELECT nextval(\'sales_return_number_seq\') AS "value"',
            );
          const value = sequence[0]?.value;

          if (value === undefined) {
            throw new ConflictException({
              code:
                'SALES_RETURN_NUMBER_UNAVAILABLE',
              message:
                'Unable to allocate a sales return number',
            });
          }

          const number =
            'SRN-' +
            value.toString().padStart(8, '0');

          const salesReturn =
            await tx.salesReturn.create({
              data: {
                number,
                salesOrderId: id,
                notes: dto.notes ?? null,
                createdByUserId: userId,
              },
              select: { id: true },
            });

          const sorted = [...prepared].sort(
            (a, b) =>
              a.line.productId.localeCompare(
                b.line.productId,
              ),
          );

          await this.acquireInventoryLocks(
            tx,
            sorted.map(
              ({ line }) =>
                line.productId,
            ),
            order.warehouseId,
          );

          const occurredAt = new Date();

          for (const item of sorted) {
            const quantity = Number(
              item.quantity,
            );
            const unitCost =
              item.line.saleMovement
                ?.unitCost;

            const movement =
              await this.movements.applyMovementInTransaction(
                tx,
                {
                  productId:
                    item.line.productId,
                  warehouseId:
                    order.warehouseId,
                  type: 'return-in',
                  quantityChange: quantity,
                  ...(unitCost !== null
                    ? {
                        unitCost: Number(
                          unitCost.toString(),
                        ),
                      }
                    : {}),
                  reference: {
                    type: 'sales-return',
                    id: salesReturn.id,
                    number,
                    referencePath:
                      '/sales/' + id,
                  },
                  notes:
                    dto.notes ?? undefined,
                  performedByUserId:
                    userId,
                  occurredAt,
                },
              );

            const updated =
              await tx.$executeRawUnsafe(
                [
                  'UPDATE "sales_order_lines"',
                  'SET "quantity_returned" = "quantity_returned" + $2::numeric(19,4)',
                  'WHERE "id" = $1::uuid',
                  '  AND "sales_order_id" = $3::uuid',
                  '  AND ("quantity_returned" + $2::numeric(19,4)) <= "quantity_dispatched"',
                ].join('\n'),
                item.line.id,
                item.quantity,
                id,
              );

            if (updated !== 1) {
              throw new ConflictException({
                code:
                  'SALES_RETURN_QUANTITY_CHANGED',
                message:
                  'Returnable quantity changed before this return could be recorded',
                details: {
                  salesOrderLineId:
                    item.line.id,
                },
              });
            }

            await tx.salesReturnLine.create({
              data: {
                salesReturnId:
                  salesReturn.id,
                salesOrderLineId:
                  item.line.id,
                quantityReturned:
                  item.quantity,
                movementId:
                  movement.id,
              },
            });
          }

          await this.audit.recordInTransaction(
            tx,
            {
              userId,
              action:
                'sales-return.created',
              entityType:
                'sales-return',
              entityId:
                salesReturn.id,
              after: {
                number,
                salesOrderId: id,
                notes:
                  dto.notes ?? null,
                lineCount:
                  prepared.length,
                lines:
                  prepared.map(
                    (item) => ({
                      salesOrderLineId:
                        item.line.id,
                      productId:
                        item.line.productId,
                      quantity:
                        item.quantity,
                    }),
                  ),
              },
            },
          );

          return salesReturn.id;
        },
      );

    const salesReturn =
      await this.prisma.salesReturn.findUnique({
        where: { id: returnId },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          lines: {
            include: {
              salesOrderLine: {
                select: {
                  productId: true,
                  product: {
                    select: {
                      sku: true,
                      name: true,
                      unit: {
                        select: {
                          symbol: true,
                        },
                      },
                    },
                  },
                },
              },
              movement: {
                select: {
                  id: true,
                  referenceNumber: true,
                },
              },
            },
          },
        },
      });

    if (!salesReturn) {
      throw new NotFoundException({
        code: 'SALES_RETURN_NOT_FOUND',
        message:
          'Sales return was not found after creation',
      });
    }

    return this.toReturn(
      salesReturn as SalesReturnRecord,
    );
  }

  private async prepareDraft(
    tx: Prisma.TransactionClient,
    dto: SalesOrderUpsertDto,
  ) {
    const orderDate =
      this.parseDateOnly(
        dto.orderDate,
        'orderDate',
      );

    const duplicate =
      this.findDuplicateProduct(
        dto.lines,
      );

    if (duplicate) {
      throw new BadRequestException({
        code:
          'SALES_ORDER_DUPLICATE_PRODUCT',
        message:
          'A product can appear only once in a sales order',
        fields: {
          lines: [
            'Remove duplicate product lines.',
          ],
        },
        details: {
          productId: duplicate,
        },
      });
    }

    const [customer, warehouse] =
      await Promise.all([
        tx.customer.findUnique({
          where: {
            id: dto.customerId,
          },
          select: {
            id: true,
            isActive: true,
          },
        }),
        tx.warehouse.findUnique({
          where: {
            id: dto.warehouseId,
          },
          select: {
            id: true,
            isActive: true,
          },
        }),
      ]);

    if (!customer || !customer.isActive) {
      throw new BadRequestException({
        code: 'SALES_CUSTOMER_UNAVAILABLE',
        message:
          'Sales orders require an active customer',
        fields: {
          customerId: [
            'Select an active customer.',
          ],
        },
      });
    }

    if (
      !warehouse ||
      !warehouse.isActive
    ) {
      throw new BadRequestException({
        code:
          'SALES_WAREHOUSE_UNAVAILABLE',
        message:
          'Sales orders require an active fulfillment warehouse',
        fields: {
          warehouseId: [
            'Select an active warehouse.',
          ],
        },
      });
    }

    const productIds = dto.lines.map(
      (line) => line.productId,
    );

    const products =
      await tx.product.findMany({
        where: {
          id: { in: productIds },
          isActive: true,
          isTrackable: true,
        },
        select: { id: true },
      });

    if (
      products.length !==
      productIds.length
    ) {
      throw new BadRequestException({
        code:
          'SALES_PRODUCT_UNAVAILABLE',
        message:
          'All sales-order products must be active and trackable',
        fields: {
          lines: [
            'One or more selected products are unavailable.',
          ],
        },
      });
    }

    const balances =
      await tx.inventoryItem.findMany({
        where: {
          warehouseId:
            dto.warehouseId,
          productId: {
            in: productIds,
          },
        },
        select: {
          productId: true,
        },
      });

    const balanceIds = new Set(
      balances.map(
        (balance) =>
          balance.productId,
      ),
    );

    const missing = productIds.find(
      (productId) =>
        !balanceIds.has(productId),
    );

    if (missing) {
      throw new BadRequestException({
        code:
          'SALES_PRODUCT_NOT_IN_WAREHOUSE',
        message:
          'A selected product has no inventory balance in the fulfillment warehouse',
        fields: {
          lines: [
            'Select products available in the chosen warehouse.',
          ],
        },
        details: {
          productId: missing,
        },
      });
    }

    const lines = dto.lines.map(
      (line) =>
        this.calculateLine(line),
    );
    const subtotal =
      this.sumLineTotals(lines);

    return {
      orderDate,
      lines,
      subtotal,
    };
  }

  private async requireOperationalOrder(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    const order =
      await tx.salesOrder.findUnique({
        where: { id },
        include: {
          customer: {
            select: {
              isActive: true,
            },
          },
          warehouse: {
            select: {
              isActive: true,
            },
          },
          lines: {
            include: {
              product: {
                select: {
                  isActive: true,
                  isTrackable: true,
                },
              },
            },
          },
        },
      });

    if (!order) {
      throw this.notFound();
    }

    if (!order.customer.isActive) {
      throw new ConflictException({
        code: 'SALES_CUSTOMER_UNAVAILABLE',
        message:
          'The customer is inactive and this sales order cannot be confirmed',
      });
    }

    if (!order.warehouse.isActive) {
      throw new ConflictException({
        code:
          'SALES_WAREHOUSE_UNAVAILABLE',
        message:
          'The fulfillment warehouse is inactive and this sales order cannot be confirmed',
      });
    }

    if (order.lines.length === 0) {
      throw new ConflictException({
        code: 'SALES_ORDER_LINES_REQUIRED',
        message:
          'A sales order requires at least one line',
      });
    }

    for (const line of order.lines) {
      if (
        !line.product.isActive ||
        !line.product.isTrackable
      ) {
        throw new ConflictException({
          code:
            'SALES_PRODUCT_UNAVAILABLE',
          message:
            'All products must remain active and trackable before confirmation',
          details: {
            productId:
              line.productId,
          },
        });
      }
    }

    return order;
  }

  private async lockWithStatus(
    tx: Prisma.TransactionClient,
    id: string,
    requiredStatus:
      | 'DRAFT'
      | 'CONFIRMED'
      | 'DISPATCHED',
  ): Promise<void> {
    const rows =
      await tx.$queryRawUnsafe<
        LockedOrderRow[]
      >(
        [
          'SELECT "status"::text AS "status"',
          'FROM "sales_orders"',
          'WHERE "id" = $1::uuid',
          'FOR UPDATE',
        ].join('\n'),
        id,
      );

    const row = rows[0];

    if (!row) {
      throw this.notFound();
    }

    if (row.status !== requiredStatus) {
      throw new ConflictException({
        code:
          'SALES_ORDER_INVALID_STATUS',
        message:
          this.statusMessage(
            requiredStatus,
          ),
        details: {
          requiredStatus:
            requiredStatus.toLowerCase(),
          currentStatus:
            row.status.toLowerCase(),
        },
      });
    }
  }

  private async acquireInventoryLocks(
    tx: Prisma.TransactionClient,
    productIds: string[],
    warehouseId: string,
  ): Promise<void> {
    const keys = [
      ...new Set(productIds),
    ]
      .map(
        (productId) =>
          productId + ':' + warehouseId,
      )
      .sort();

    for (const key of keys) {
      await tx.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',
        key,
      );
    }
  }

  private calculateLine(
    line: SalesOrderLineDto,
  ): CalculatedLine {
    const quantity =
      this.toScaled4(line.quantity);
    const unitPrice =
      this.toScaled4(line.unitPrice);
    const lineTotalScaled =
      (quantity.scaled *
        unitPrice.scaled +
        5000n) /
      10000n;

    if (
      lineTotalScaled >
      MAX_DECIMAL_19_4_SCALED
    ) {
      throw new BadRequestException({
        code:
          'SALES_ORDER_LINE_TOTAL_TOO_LARGE',
        message:
          'A sales-order line total exceeds the supported monetary range',
        fields: {
          lines: [
            'Reduce the quantity or unit price.',
          ],
        },
        details: {
          productId: line.productId,
        },
      });
    }

    return {
      productId: line.productId,
      quantity: quantity.text,
      unitPrice: unitPrice.text,
      lineTotal:
        this.formatScaled4(
          lineTotalScaled,
        ),
    };
  }

  private sumLineTotals(
    lines: CalculatedLine[],
  ): string {
    let total = 0n;

    for (const line of lines) {
      total += this.parseScaled4(
        line.lineTotal,
      );

      if (
        total >
        MAX_DECIMAL_19_4_SCALED
      ) {
        throw new BadRequestException({
          code:
            'SALES_ORDER_SUBTOTAL_TOO_LARGE',
          message:
            'Sales-order subtotal exceeds the supported monetary range',
          fields: {
            lines: [
              'Reduce the sales-order quantities or prices.',
            ],
          },
        });
      }
    }

    return this.formatScaled4(total);
  }

  private findDuplicateProduct(
    lines: ReadonlyArray<{
      productId: string;
    }>,
  ): string | undefined {
    const seen = new Set<string>();

    for (const line of lines) {
      if (seen.has(line.productId)) {
        return line.productId;
      }
      seen.add(line.productId);
    }

    return undefined;
  }

  private findDuplicateReturnLine(
    lines: ReadonlyArray<{
      salesOrderLineId: string;
    }>,
  ): string | undefined {
    const seen = new Set<string>();

    for (const line of lines) {
      if (
        seen.has(
          line.salesOrderLineId,
        )
      ) {
        return line.salesOrderLineId;
      }
      seen.add(
        line.salesOrderLineId,
      );
    }

    return undefined;
  }

  private toSummary(
    item: SalesOrderSummaryRecord,
  ) {
    return {
      id: item.id,
      number: item.number,
      customerId: item.customerId,
      customerCode:
        item.customer.code,
      customerName:
        item.customer.name,
      warehouseId: item.warehouseId,
      warehouseCode:
        item.warehouse.code,
      warehouseName:
        item.warehouse.name,
      orderDate:
        this.dateOnly(item.orderDate),
      status: this.statusFromDb(
        item.status,
      ),
      lineCount: item._count.lines,
      subtotal: Number(
        item.subtotal.toString(),
      ),
      currencyCode:
        item.currencyCode,
      createdAt: item.createdAt,
      ...(item.confirmedAt
        ? {
            confirmedAt:
              item.confirmedAt,
          }
        : {}),
      ...(item.dispatchedAt
        ? {
            dispatchedAt:
              item.dispatchedAt,
          }
        : {}),
      ...(item.completedAt
        ? {
            completedAt:
              item.completedAt,
          }
        : {}),
    };
  }

  private toDetail(
    item: SalesOrderDetailRecord,
  ) {
    return {
      ...this.toSummary(item),
      ...(item.notes
        ? { notes: item.notes }
        : {}),
      lines: item.lines.map(
        (line) => ({
          id: line.id,
          productId: line.productId,
          sku: line.product.sku,
          productName:
            line.product.name,
          ...(line.product.unit
            ? {
                unitSymbol:
                  line.product.unit.symbol,
              }
            : {}),
          quantity: Number(
            line.quantity.toString(),
          ),
          unitPrice: Number(
            line.unitPrice.toString(),
          ),
          lineTotal: Number(
            line.lineTotal.toString(),
          ),
          quantityReserved: Number(
            line.quantityReserved.toString(),
          ),
          quantityDispatched: Number(
            line.quantityDispatched.toString(),
          ),
          quantityReturned: Number(
            line.quantityReturned.toString(),
          ),
          ...(line.saleMovement
            ? {
                saleMovement: {
                  id:
                    line.saleMovement.id,
                  ...(line.saleMovement
                    .referenceNumber
                    ? {
                        number:
                          line.saleMovement
                            .referenceNumber,
                      }
                    : {}),
                },
              }
            : {}),
        }),
      ),
      returns: item.returns.map(
        (salesReturn) =>
          this.toReturn(salesReturn),
      ),
      createdBy: this.actor(
        item.createdBy,
      ),
      ...(item.confirmedBy
        ? {
            confirmedBy: this.actor(
              item.confirmedBy,
            ),
          }
        : {}),
      ...(item.dispatchedBy
        ? {
            dispatchedBy: this.actor(
              item.dispatchedBy,
            ),
          }
        : {}),
      ...(item.completedBy
        ? {
            completedBy: this.actor(
              item.completedBy,
            ),
          }
        : {}),
    };
  }

  private toReturn(
    salesReturn: SalesReturnRecord,
  ) {
    return {
      id: salesReturn.id,
      number: salesReturn.number,
      createdAt:
        salesReturn.createdAt,
      createdBy: this.actor(
        salesReturn.createdBy,
      ),
      lines: salesReturn.lines.map(
        (line) => ({
          id: line.id,
          salesOrderLineId:
            line.salesOrderLineId,
          productId:
            line.salesOrderLine
              .productId,
          sku:
            line.salesOrderLine
              .product.sku,
          productName:
            line.salesOrderLine
              .product.name,
          ...(line.salesOrderLine.product
            .unit
            ? {
                unitSymbol:
                  line.salesOrderLine
                    .product.unit.symbol,
              }
            : {}),
          quantityReturned: Number(
            line.quantityReturned.toString(),
          ),
          movement: {
            id: line.movement.id,
            ...(line.movement
              .referenceNumber
              ? {
                  number:
                    line.movement
                      .referenceNumber,
                }
              : {}),
          },
        }),
      ),
    };
  }

  private actor(user: ActorRecord) {
    return {
      id: user.id,
      name:
        user.firstName +
        ' ' +
        user.lastName,
    };
  }

  private statusFromDb(
    status: string,
  ) {
    const value =
      SALES_ORDER_STATUS_FROM_DB[
        status as keyof typeof SALES_ORDER_STATUS_FROM_DB
      ];

    if (!value) {
      throw new Error(
        'Unsupported sales order status: ' +
          status,
      );
    }

    return value;
  }

  private statusMessage(
    requiredStatus:
      | 'DRAFT'
      | 'CONFIRMED'
      | 'DISPATCHED',
  ): string {
    switch (requiredStatus) {
      case 'DRAFT':
        return 'Only draft sales orders can be changed or confirmed';
      case 'CONFIRMED':
        return 'Only confirmed sales orders can be cancelled or dispatched';
      case 'DISPATCHED':
        return 'Only dispatched sales orders can be completed';
    }
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
      case 'customerName':
        return {
          customer: { name: order },
        };
      case 'warehouseName':
        return {
          warehouse: { name: order },
        };
      case 'orderDate':
        return { orderDate: order };
      case 'subtotal':
        return { subtotal: order };
      case 'status':
        return { status: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for sales orders',
          statusCode:
            HttpStatus.BAD_REQUEST,
          details: { sort },
        });
    }
  }

  private assertSort(
    sort: string | undefined,
  ): void {
    if (
      sort !== undefined &&
      ![
        'createdAt',
        'number',
        'customerName',
        'warehouseName',
        'orderDate',
        'subtotal',
        'status',
      ].includes(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for sales orders',
        statusCode:
          HttpStatus.BAD_REQUEST,
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

    const from = this.parseDateOnly(
      dateFrom,
      'dateFrom',
    );
    const to = this.parseDateOnly(
      dateTo,
      'dateTo',
    );

    if (from > to) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message:
          'dateFrom must be before or equal to dateTo',
      });
    }
  }

  private parseDateOnly(
    value: string,
    field: string,
  ): Date {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        value,
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message:
          field +
          ' must use YYYY-MM-DD format',
        fields: {
          [field]: [
            'Use YYYY-MM-DD format.',
          ],
        },
      });
    }

    const date = new Date(
      value + 'T00:00:00.000Z',
    );

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !==
        value
    ) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message:
          field +
          ' must be a valid calendar date',
        fields: {
          [field]: [
            'Enter a valid calendar date.',
          ],
        },
      });
    }

    return date;
  }

  private addDays(
    date: Date,
    days: number,
  ): Date {
    const result = new Date(date);
    result.setUTCDate(
      result.getUTCDate() + days,
    );
    return result;
  }

  private dateOnly(date: Date): string {
    return date
      .toISOString()
      .slice(0, 10);
  }

  private toScaled4(value: number): {
    scaled: bigint;
    text: string;
  } {
    const text = value.toFixed(4);

    return {
      scaled: this.parseScaled4(text),
      text,
    };
  }

  private parseScaled4(
    value: string,
  ): bigint {
    const negative =
      value.startsWith('-');
    const normalized = negative
      ? value.slice(1)
      : value;
    const [whole, fraction = ''] =
      normalized.split('.');
    const scaled = BigInt(
      whole +
        fraction
          .padEnd(4, '0')
          .slice(0, 4),
    );

    return negative
      ? -scaled
      : scaled;
  }

  private formatScaled4(
    value: bigint,
  ): string {
    const negative = value < 0n;
    const absolute = negative
      ? -value
      : value;
    const whole = absolute / 10000n;
    const fraction = (
      absolute % 10000n
    )
      .toString()
      .padStart(4, '0');

    return (
      (negative ? '-' : '') +
      whole.toString() +
      '.' +
      fraction
    );
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'SALES_ORDER_NOT_FOUND',
      message:
        'Sales order was not found',
    });
  }
}
