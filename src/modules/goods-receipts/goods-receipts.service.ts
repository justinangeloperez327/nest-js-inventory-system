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
import type { Prisma } from '../../generated/prisma/client.js';
import { StockMovementsService } from '../stock-movements/stock-movements.service.js';
import type { GoodsReceiptPurchaseOrderQueryDto } from './dto/goods-receipt-purchase-order-query.dto.js';
import type { GoodsReceiptQueryDto } from './dto/goods-receipt-query.dto.js';
import type { GoodsReceiptUpsertDto } from './dto/goods-receipt-upsert.dto.js';
import {
  GOODS_RECEIPT_STATUS_FROM_DB,
  GOODS_RECEIPT_STATUS_TO_DB,
} from './goods-receipt.constants.js';

interface DecimalLike {
  toString(): string;
}

interface ReceiptSummaryRecord {
  id: string;
  number: string;
  purchaseOrderId: string;
  receiptDate: Date;
  supplierDeliveryReference: string | null;
  status: string;
  createdAt: Date;
  postedAt: Date | null;
  purchaseOrder: {
    number: string;
    supplierId: string;
    warehouseId: string;
    supplier: {
      code: string;
      name: string;
    };
    warehouse: {
      code: string;
      name: string;
    };
  };
  _count: {
    lines: number;
  };
}

interface ReceiptDetailRecord
  extends ReceiptSummaryRecord {
  notes: string | null;
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
  lines: Array<{
    id: string;
    purchaseOrderLineId: string;
    quantityReceived: DecimalLike;
    quantityReceivedBefore: DecimalLike | null;
    balanceBefore: DecimalLike | null;
    balanceAfter: DecimalLike | null;
    movement: {
      id: string;
    } | null;
    purchaseOrderLine: {
      purchaseOrderId: string;
      productId: string;
      quantity: DecimalLike;
      quantityReceived: DecimalLike;
      unitPrice: DecimalLike;
      product: {
        sku: string;
        name: string;
        unit: {
          symbol: string;
        } | null;
      };
    };
  }>;
}

interface SequenceRow {
  value: bigint;
}

interface LockedReceiptRow {
  status: string;
  purchaseOrderId: string;
}

interface LockedPurchaseOrderRow {
  status: string;
}

interface HasRemainingRow {
  hasRemaining: boolean;
}

interface PreparedReceiptLine {
  purchaseOrderLineId: string;
  quantityReceived: string;
}

const ELIGIBLE_PO_STATUSES = [
  'APPROVED',
  'PARTIALLY_RECEIVED',
] as const;

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: StockMovementsService,
  ) {}

  async list(query: GoodsReceiptQueryDto) {
    this.assertSort(query.sort);
    this.assertDateRange(query.dateFrom, query.dateTo);

    const { skip, take } = toPaginationWindow(query);
    const search = query.search?.trim();
    const dateFrom = query.dateFrom
      ? this.parseDateOnly(query.dateFrom, 'dateFrom')
      : null;
    const dateTo = query.dateTo
      ? this.addDays(
          this.parseDateOnly(query.dateTo, 'dateTo'),
          1,
        )
      : null;

    const where = {
      ...(query.purchaseOrderId
        ? { purchaseOrderId: query.purchaseOrderId }
        : {}),
      ...(query.warehouseId
        ? {
            purchaseOrder: {
              warehouseId: query.warehouseId,
            },
          }
        : {}),
      ...(query.status
        ? {
            status:
              GOODS_RECEIPT_STATUS_TO_DB[query.status],
          }
        : {}),
      ...(dateFrom || dateTo
        ? {
            receiptDate: {
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
                supplierDeliveryReference: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                purchaseOrder: {
                  number: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                purchaseOrder: {
                  supplier: {
                    code: {
                      contains: search,
                      mode:
                        'insensitive' as const,
                    },
                  },
                },
              },
              {
                purchaseOrder: {
                  supplier: {
                    name: {
                      contains: search,
                      mode:
                        'insensitive' as const,
                    },
                  },
                },
              },
              {
                purchaseOrder: {
                  warehouse: {
                    code: {
                      contains: search,
                      mode:
                        'insensitive' as const,
                    },
                  },
                },
              },
              {
                purchaseOrder: {
                  warehouse: {
                    name: {
                      contains: search,
                      mode:
                        'insensitive' as const,
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
        this.prisma.goodsReceipt.findMany({
          where,
          skip,
          take,
          orderBy: this.orderBy(
            query.sort,
            query.resolvedOrder,
          ),
          include: {
            purchaseOrder: {
              select: {
                number: true,
                supplierId: true,
                warehouseId: true,
                supplier: {
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
              },
            },
            _count: {
              select: { lines: true },
            },
          },
        }),
        this.prisma.goodsReceipt.count({ where }),
      ]);

    return toPaginatedResult(
      items.map((item) =>
        this.toSummary(item as ReceiptSummaryRecord),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const receipt =
      await this.prisma.goodsReceipt.findUnique({
        where: { id },
        include: {
          purchaseOrder: {
            select: {
              number: true,
              supplierId: true,
              warehouseId: true,
              supplier: {
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
          lines: {
            orderBy: [
              {
                purchaseOrderLine: {
                  product: {
                    name: 'asc',
                  },
                },
              },
              { id: 'asc' },
            ],
            include: {
              purchaseOrderLine: {
                select: {
                  purchaseOrderId: true,
                  productId: true,
                  quantity: true,
                  quantityReceived: true,
                  unitPrice: true,
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
                select: { id: true },
              },
            },
          },
          _count: {
            select: { lines: true },
          },
        },
      });

    if (!receipt) {
      throw this.notFound();
    }

    return this.toDetail(
      receipt as ReceiptDetailRecord,
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

    return { warehouses };
  }

  async purchaseOrderOptions(
    query: GoodsReceiptPurchaseOrderQueryDto,
  ) {
    const search = query.search.trim();

    const items =
      await this.prisma.purchaseOrder.findMany({
        where: {
          status: {
            in: [...ELIGIBLE_PO_STATUSES],
          },
          OR: [
            {
              number: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              supplier: {
                code: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              supplier: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              warehouse: {
                code: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              warehouse: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          ],
        },
        orderBy: [
          { expectedDate: 'asc' },
          { number: 'asc' },
        ],
        take: query.limit,
        select: {
          id: true,
          number: true,
          expectedDate: true,
          supplier: {
            select: { name: true },
          },
          warehouse: {
            select: { name: true },
          },
        },
      });

    return items.map((item) => ({
      id: item.id,
      number: item.number,
      supplierName: item.supplier.name,
      warehouseName: item.warehouse.name,
      ...(item.expectedDate
        ? {
            expectedDate: this.dateOnly(
              item.expectedDate,
            ),
          }
        : {}),
    }));
  }

  async purchaseOrderContext(
    purchaseOrderId: string,
  ) {
    const purchaseOrder =
      await this.prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
          supplier: {
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
            },
          },
        },
      });

    if (!purchaseOrder) {
      throw this.purchaseOrderNotFound();
    }

    if (
      !ELIGIBLE_PO_STATUSES.includes(
        purchaseOrder.status as
          (typeof ELIGIBLE_PO_STATUSES)[number],
      )
    ) {
      throw this.purchaseOrderNotReceivable();
    }

    return {
      id: purchaseOrder.id,
      number: purchaseOrder.number,
      supplierId: purchaseOrder.supplierId,
      supplierCode: purchaseOrder.supplier.code,
      supplierName: purchaseOrder.supplier.name,
      warehouseId: purchaseOrder.warehouseId,
      warehouseCode: purchaseOrder.warehouse.code,
      warehouseName: purchaseOrder.warehouse.name,
      ...(purchaseOrder.expectedDate
        ? {
            expectedDate: this.dateOnly(
              purchaseOrder.expectedDate,
            ),
          }
        : {}),
      lines: purchaseOrder.lines.map((line) => {
        const ordered = this.parseScaled4(
          line.quantity.toString(),
        );
        const received = this.parseScaled4(
          line.quantityReceived.toString(),
        );
        const remaining =
          ordered - received;

        return {
          id: line.id,
          productId: line.productId,
          sku: line.product.sku,
          productName: line.product.name,
          ...(line.product.unit
            ? {
                unitSymbol:
                  line.product.unit.symbol,
              }
            : {}),
          quantityOrdered: Number(
            this.formatScaled4(ordered),
          ),
          quantityReceived: Number(
            this.formatScaled4(received),
          ),
          quantityRemaining: Number(
            this.formatScaled4(
              remaining < 0n
                ? 0n
                : remaining,
            ),
          ),
        };
      }),
    };
  }

  async create(
    dto: GoodsReceiptUpsertDto,
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
            'SELECT nextval(\'goods_receipt_number_seq\') AS "value"',
          );
        const value = sequence[0]?.value;

        if (value === undefined) {
          throw new ConflictException({
            code: 'GOODS_RECEIPT_NUMBER_UNAVAILABLE',
            message:
              'Unable to allocate a goods receipt number',
          });
        }

        const number =
          'GRN-' +
          value.toString().padStart(8, '0');

        const receipt =
          await tx.goodsReceipt.create({
            data: {
              number,
              purchaseOrderId:
                dto.purchaseOrderId,
              receiptDate:
                prepared.receiptDate,
              supplierDeliveryReference:
                dto.supplierDeliveryReference ??
                null,
              notes: dto.notes ?? null,
              createdByUserId: userId,
              lines: {
                create:
                  prepared.lines.map(
                    (line) => ({
                      purchaseOrderLineId:
                        line.purchaseOrderLineId,
                      quantityReceived:
                        line.quantityReceived,
                    }),
                  ),
              },
            },
            select: { id: true },
          });

        return receipt.id;
      },
    );

    return this.get(id);
  }

  async update(
    id: string,
    dto: GoodsReceiptUpsertDto,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const locked =
          await this.lockDraft(tx, id);

        if (
          locked.purchaseOrderId !==
          dto.purchaseOrderId
        ) {
          throw new ConflictException({
            code:
              'GOODS_RECEIPT_PURCHASE_ORDER_IMMUTABLE',
            message:
              'The purchase order cannot be changed after a receipt draft is created',
            fields: {
              purchaseOrderId: [
                'Create a new receipt for a different purchase order.',
              ],
            },
          });
        }

        const prepared =
          await this.prepareDraft(tx, dto);

        await tx.goodsReceipt.update({
          where: { id },
          data: {
            receiptDate:
              prepared.receiptDate,
            supplierDeliveryReference:
              dto.supplierDeliveryReference ??
              null,
            notes: dto.notes ?? null,
          },
        });

        await tx.goodsReceiptLine.deleteMany({
          where: { goodsReceiptId: id },
        });

        await tx.goodsReceiptLine.createMany({
          data: prepared.lines.map(
            (line) => ({
              goodsReceiptId: id,
              purchaseOrderLineId:
                line.purchaseOrderLineId,
              quantityReceived:
                line.quantityReceived,
            }),
          ),
        });
      },
    );

    return this.get(id);
  }

  async post(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const lockedReceipt =
          await this.lockDraft(tx, id);

        const poLocks =
          await tx.$queryRawUnsafe<
            LockedPurchaseOrderRow[]
          >(
            [
              'SELECT "status"::text AS "status"',
              'FROM "purchase_orders"',
              'WHERE "id" = $1::uuid',
              'FOR UPDATE',
            ].join('\n'),
            lockedReceipt.purchaseOrderId,
          );

        const poLock = poLocks[0];

        if (!poLock) {
          throw this.purchaseOrderNotFound();
        }

        if (
          !ELIGIBLE_PO_STATUSES.includes(
            poLock.status as
              (typeof ELIGIBLE_PO_STATUSES)[number],
          )
        ) {
          throw this.purchaseOrderNotReceivable();
        }

        const receipt =
          await tx.goodsReceipt.findUnique({
            where: { id },
            include: {
              purchaseOrder: {
                include: {
                  warehouse: {
                    select: {
                      isActive: true,
                    },
                  },
                },
              },
              lines: {
                include: {
                  purchaseOrderLine: {
                    include: {
                      product: {
                        select: {
                          id: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

        if (!receipt) {
          throw this.notFound();
        }

        if (
          receipt.purchaseOrderId !==
          lockedReceipt.purchaseOrderId
        ) {
          throw new ConflictException({
            code: 'GOODS_RECEIPT_CONTEXT_CHANGED',
            message:
              'Goods receipt purchase-order context changed unexpectedly',
          });
        }

        if (
          !receipt.purchaseOrder.warehouse.isActive
        ) {
          throw new ConflictException({
            code:
              'GOODS_RECEIPT_WAREHOUSE_UNAVAILABLE',
            message:
              'The purchase-order warehouse is inactive and cannot receive stock',
          });
        }

        if (receipt.lines.length === 0) {
          throw new ConflictException({
            code: 'GOODS_RECEIPT_LINES_REQUIRED',
            message:
              'A goods receipt requires at least one positive line',
          });
        }

        const duplicate =
          this.findDuplicateLine(
            receipt.lines,
          );

        if (duplicate) {
          throw new ConflictException({
            code: 'GOODS_RECEIPT_DUPLICATE_PO_LINE',
            message:
              'A purchase-order line can appear only once in a goods receipt',
            details: {
              purchaseOrderLineId:
                duplicate,
            },
          });
        }

        for (const line of receipt.lines) {
          if (
            line.purchaseOrderLine
              .purchaseOrderId !==
            receipt.purchaseOrderId
          ) {
            throw new ConflictException({
              code:
                'GOODS_RECEIPT_LINE_NOT_ON_PURCHASE_ORDER',
              message:
                'A receipt line does not belong to the selected purchase order',
              details: {
                purchaseOrderLineId:
                  line.purchaseOrderLineId,
              },
            });
          }

          const ordered =
            this.parseScaled4(
              line.purchaseOrderLine.quantity.toString(),
            );
          const previouslyReceived =
            this.parseScaled4(
              line.purchaseOrderLine.quantityReceived.toString(),
            );
          const receiving =
            this.parseScaled4(
              line.quantityReceived.toString(),
            );
          const remaining =
            ordered - previouslyReceived;

          if (
            receiving <= 0n ||
            receiving > remaining
          ) {
            throw new ConflictException({
              code:
                'GOODS_RECEIPT_EXCEEDS_PO_REMAINING',
              message:
                'Received quantity exceeds the current purchase-order remaining quantity',
              details: {
                purchaseOrderLineId:
                  line.purchaseOrderLineId,
                remaining: Number(
                  this.formatScaled4(
                    remaining < 0n
                      ? 0n
                      : remaining,
                  ),
                ),
                requested: Number(
                  line.quantityReceived.toString(),
                ),
              },
            });
          }
        }

        const occurredAt = new Date();
        const sortedLines = [
          ...receipt.lines,
        ].sort((a, b) =>
          a.purchaseOrderLine.productId.localeCompare(
            b.purchaseOrderLine.productId,
          ),
        );

        for (const line of sortedLines) {
          const poLine =
            line.purchaseOrderLine;
          const quantityText =
            line.quantityReceived.toString();
          const quantity = Number(
            quantityText,
          );
          const previouslyReceived =
            poLine.quantityReceived.toString();

          const movement =
            await this.movements.applyMovementInTransaction(
              tx,
              {
                productId:
                  poLine.productId,
                warehouseId:
                  receipt.purchaseOrder
                    .warehouseId,
                type: 'receipt',
                quantityChange: quantity,
                unitCost: Number(
                  poLine.unitPrice.toString(),
                ),
                reference: {
                  type: 'goods-receipt',
                  id: receipt.id,
                  number: receipt.number,
                  referencePath:
                    '/receiving/' +
                    receipt.id,
                },
                notes:
                  receipt.notes ?? undefined,
                performedByUserId: userId,
                occurredAt,
              },
            );

          const updated =
            await tx.$queryRawUnsafe<
              Array<{
                quantityReceived: string;
              }>
            >(
              [
                'UPDATE "purchase_order_lines"',
                'SET "quantity_received" = "quantity_received" + $2::numeric(19,4)',
                'WHERE "id" = $1::uuid',
                '  AND "purchase_order_id" = $3::uuid',
                '  AND ("quantity_received" + $2::numeric(19,4)) <= "quantity"',
                'RETURNING "quantity_received"::text AS "quantityReceived"',
              ].join('\n'),
              line.purchaseOrderLineId,
              quantityText,
              receipt.purchaseOrderId,
            );

          if (!updated[0]) {
            throw new ConflictException({
              code:
                'GOODS_RECEIPT_EXCEEDS_PO_REMAINING',
              message:
                'Purchase-order remaining quantity changed before this receipt could be posted',
              details: {
                purchaseOrderLineId:
                  line.purchaseOrderLineId,
              },
            });
          }

          await tx.goodsReceiptLine.update({
            where: { id: line.id },
            data: {
              quantityReceivedBefore:
                previouslyReceived,
              balanceBefore:
                movement.balanceBefore,
              balanceAfter:
                movement.balanceAfter,
              movementId: movement.id,
            },
          });
        }

        const remainingRows =
          await tx.$queryRawUnsafe<
            HasRemainingRow[]
          >(
            [
              'SELECT EXISTS (',
              '  SELECT 1',
              '  FROM "purchase_order_lines"',
              '  WHERE "purchase_order_id" = $1::uuid',
              '    AND "quantity_received" < "quantity"',
              ') AS "hasRemaining"',
            ].join('\n'),
            receipt.purchaseOrderId,
          );

        const hasRemaining =
          remainingRows[0]?.hasRemaining ??
          false;

        await tx.purchaseOrder.update({
          where: {
            id: receipt.purchaseOrderId,
          },
          data: {
            status: hasRemaining
              ? 'PARTIALLY_RECEIVED'
              : 'RECEIVED',
          },
        });

        await tx.goodsReceipt.update({
          where: { id },
          data: {
            status: 'POSTED',
            postedAt: occurredAt,
            postedByUserId: userId,
          },
        });
      },
    );

    return this.get(id);
  }

  private async prepareDraft(
    tx: Prisma.TransactionClient,
    dto: GoodsReceiptUpsertDto,
  ): Promise<{
    receiptDate: Date;
    lines: PreparedReceiptLine[];
  }> {
    const receiptDate =
      this.parseDateOnly(
        dto.receiptDate,
        'receiptDate',
      );

    const duplicate =
      this.findDuplicateLine(dto.lines);

    if (duplicate) {
      throw new BadRequestException({
        code: 'GOODS_RECEIPT_DUPLICATE_PO_LINE',
        message:
          'A purchase-order line can appear only once in a goods receipt',
        fields: {
          lines: [
            'Remove duplicate purchase-order lines.',
          ],
        },
        details: {
          purchaseOrderLineId: duplicate,
        },
      });
    }

    const purchaseOrder =
      await tx.purchaseOrder.findUnique({
        where: {
          id: dto.purchaseOrderId,
        },
        include: {
          warehouse: {
            select: {
              isActive: true,
            },
          },
          lines: {
            select: {
              id: true,
              quantity: true,
              quantityReceived: true,
            },
          },
        },
      });

    if (!purchaseOrder) {
      throw this.purchaseOrderNotFound();
    }

    if (
      !ELIGIBLE_PO_STATUSES.includes(
        purchaseOrder.status as
          (typeof ELIGIBLE_PO_STATUSES)[number],
      )
    ) {
      throw this.purchaseOrderNotReceivable();
    }

    if (!purchaseOrder.warehouse.isActive) {
      throw new BadRequestException({
        code:
          'GOODS_RECEIPT_WAREHOUSE_UNAVAILABLE',
        message:
          'The purchase-order warehouse is inactive and cannot receive stock',
        fields: {
          purchaseOrderId: [
            'Select a purchase order with an active warehouse.',
          ],
        },
      });
    }

    const poLines = new Map(
      purchaseOrder.lines.map(
        (line) => [line.id, line] as const,
      ),
    );

    const prepared =
      dto.lines.map((line) => {
        const poLine = poLines.get(
          line.purchaseOrderLineId,
        );

        if (!poLine) {
          throw new BadRequestException({
            code:
              'GOODS_RECEIPT_LINE_NOT_ON_PURCHASE_ORDER',
            message:
              'A receipt line does not belong to the selected purchase order',
            fields: {
              lines: [
                'Select lines from the chosen purchase order.',
              ],
            },
            details: {
              purchaseOrderLineId:
                line.purchaseOrderLineId,
            },
          });
        }

        const ordered =
          this.parseScaled4(
            poLine.quantity.toString(),
          );
        const received =
          this.parseScaled4(
            poLine.quantityReceived.toString(),
          );
        const requested =
          this.toScaled4(
            line.quantityReceived,
          );
        const remaining =
          ordered - received;

        if (requested.scaled > remaining) {
          throw new BadRequestException({
            code:
              'GOODS_RECEIPT_EXCEEDS_PO_REMAINING',
            message:
              'Received quantity exceeds the current purchase-order remaining quantity',
            fields: {
              lines: [
                'Reduce the received quantity to the current PO remaining quantity.',
              ],
            },
            details: {
              purchaseOrderLineId:
                line.purchaseOrderLineId,
              remaining: Number(
                this.formatScaled4(
                  remaining < 0n
                    ? 0n
                    : remaining,
                ),
              ),
            },
          });
        }

        return {
          purchaseOrderLineId:
            line.purchaseOrderLineId,
          quantityReceived:
            requested.text,
        };
      });

    return {
      receiptDate,
      lines: prepared,
    };
  }

  private async lockDraft(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<LockedReceiptRow> {
    const rows =
      await tx.$queryRawUnsafe<
        LockedReceiptRow[]
      >(
        [
          'SELECT',
          '  "status"::text AS "status",',
          '  "purchase_order_id"::text AS "purchaseOrderId"',
          'FROM "goods_receipts"',
          'WHERE "id" = $1::uuid',
          'FOR UPDATE',
        ].join('\n'),
        id,
      );

    const row = rows[0];

    if (!row) {
      throw this.notFound();
    }

    if (row.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'GOODS_RECEIPT_NOT_DRAFT',
        message:
          'Only draft goods receipts can be changed or posted',
      });
    }

    return row;
  }

  private findDuplicateLine(
    lines: ReadonlyArray<{
      purchaseOrderLineId: string;
    }>,
  ): string | undefined {
    const seen = new Set<string>();

    for (const line of lines) {
      if (
        seen.has(
          line.purchaseOrderLineId,
        )
      ) {
        return line.purchaseOrderLineId;
      }

      seen.add(
        line.purchaseOrderLineId,
      );
    }

    return undefined;
  }

  private toSummary(
    receipt: ReceiptSummaryRecord,
  ) {
    return {
      id: receipt.id,
      number: receipt.number,
      purchaseOrderId:
        receipt.purchaseOrderId,
      purchaseOrderNumber:
        receipt.purchaseOrder.number,
      supplierId:
        receipt.purchaseOrder.supplierId,
      supplierCode:
        receipt.purchaseOrder.supplier.code,
      supplierName:
        receipt.purchaseOrder.supplier.name,
      warehouseId:
        receipt.purchaseOrder.warehouseId,
      warehouseCode:
        receipt.purchaseOrder.warehouse.code,
      warehouseName:
        receipt.purchaseOrder.warehouse.name,
      receiptDate:
        this.dateOnly(receipt.receiptDate),
      ...(receipt.supplierDeliveryReference
        ? {
            supplierDeliveryReference:
              receipt.supplierDeliveryReference,
          }
        : {}),
      lineCount: receipt._count.lines,
      status: this.statusFromDb(
        receipt.status,
      ),
      createdAt: receipt.createdAt,
      ...(receipt.postedAt
        ? {
            postedAt: receipt.postedAt,
          }
        : {}),
    };
  }

  private toDetail(
    receipt: ReceiptDetailRecord,
  ) {
    return {
      ...this.toSummary(receipt),
      ...(receipt.notes
        ? { notes: receipt.notes }
        : {}),
      lines: receipt.lines.map((line) => {
        const poLine =
          line.purchaseOrderLine;
        const ordered =
          this.parseScaled4(
            poLine.quantity.toString(),
          );
        const receiptQuantity =
          this.parseScaled4(
            line.quantityReceived.toString(),
          );
        const before =
          line.quantityReceivedBefore
            ? this.parseScaled4(
                line.quantityReceivedBefore.toString(),
              )
            : this.parseScaled4(
                poLine.quantityReceived.toString(),
              );
        const remainingAfter =
          ordered -
          before -
          receiptQuantity;

        return {
          id: line.id,
          purchaseOrderLineId:
            line.purchaseOrderLineId,
          productId: poLine.productId,
          sku: poLine.product.sku,
          productName:
            poLine.product.name,
          ...(poLine.product.unit
            ? {
                unitSymbol:
                  poLine.product.unit.symbol,
              }
            : {}),
          quantityOrdered: Number(
            this.formatScaled4(ordered),
          ),
          quantityReceivedBefore:
            Number(
              this.formatScaled4(before),
            ),
          quantityReceived: Number(
            this.formatScaled4(
              receiptQuantity,
            ),
          ),
          quantityRemainingAfter:
            Number(
              this.formatScaled4(
                remainingAfter < 0n
                  ? 0n
                  : remainingAfter,
              ),
            ),
          ...(line.balanceBefore
            ? {
                balanceBefore: Number(
                  line.balanceBefore.toString(),
                ),
              }
            : {}),
          ...(line.balanceAfter
            ? {
                balanceAfter: Number(
                  line.balanceAfter.toString(),
                ),
              }
            : {}),
          ...(line.movement
            ? {
                movement: {
                  id: line.movement.id,
                },
              }
            : {}),
        };
      }),
      createdBy: this.actor(
        receipt.createdBy,
      ),
      ...(receipt.postedBy
        ? {
            postedBy: this.actor(
              receipt.postedBy,
            ),
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
        user.firstName +
        ' ' +
        user.lastName,
    };
  }

  private statusFromDb(
    status: string,
  ) {
    const value =
      GOODS_RECEIPT_STATUS_FROM_DB[
        status as keyof typeof GOODS_RECEIPT_STATUS_FROM_DB
      ];

    if (!value) {
      throw new Error(
        'Unsupported goods receipt status: ' +
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
      case 'purchaseOrderNumber':
        return {
          purchaseOrder: {
            number: order,
          },
        };
      case 'supplierName':
        return {
          purchaseOrder: {
            supplier: {
              name: order,
            },
          },
        };
      case 'warehouseName':
        return {
          purchaseOrder: {
            warehouse: {
              name: order,
            },
          },
        };
      case 'receiptDate':
        return { receiptDate: order };
      case 'status':
        return { status: order };
      case 'postedAt':
        return { postedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for goods receipts',
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
        'purchaseOrderNumber',
        'supplierName',
        'warehouseName',
        'receiptDate',
        'status',
        'postedAt',
      ].includes(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for goods receipts',
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
      code: 'GOODS_RECEIPT_NOT_FOUND',
      message: 'Goods receipt was not found',
    });
  }

  private purchaseOrderNotFound():
    NotFoundException {
    return new NotFoundException({
      code: 'PURCHASE_ORDER_NOT_FOUND',
      message:
        'Purchase order was not found',
    });
  }

  private purchaseOrderNotReceivable():
    ConflictException {
    return new ConflictException({
      code: 'PURCHASE_ORDER_NOT_RECEIVABLE',
      message:
        'Only approved or partially received purchase orders can receive goods',
    });
  }
}
