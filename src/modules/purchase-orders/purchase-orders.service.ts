import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../common/exceptions/api.exception.js';
import {
  toPaginatedResult,
  toPaginationWindow,
} from '../../common/utils/pagination.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PurchaseOrderLookupQueryDto } from './dto/purchase-order-lookup-query.dto.js';
import type { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto.js';
import type {
  PurchaseOrderLineDto,
  PurchaseOrderUpsertDto,
} from './dto/purchase-order-upsert.dto.js';
import {
  PURCHASE_ORDER_STATUS_FROM_DB,
  PURCHASE_ORDER_STATUS_TO_DB,
} from './purchase-order.constants.js';

interface DecimalLike {
  toString(): string;
}

interface PurchaseOrderSummaryRecord {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  orderDate: Date;
  expectedDate: Date | null;
  status: string;
  subtotal: DecimalLike;
  currencyCode: string;
  createdAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  supplier: {
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

interface PurchaseOrderDetailRecord
  extends PurchaseOrderSummaryRecord {
  notes: string | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  submittedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  approvedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  lines: Array<{
    id: string;
    productId: string;
    quantity: DecimalLike;
    unitPrice: DecimalLike;
    lineTotal: DecimalLike;
    quantityReceived: DecimalLike;
    product: {
      sku: string;
      name: string;
      unit: {
        symbol: string;
      } | null;
    };
  }>;
}

interface SequenceRow {
  value: bigint;
}

interface LockedPurchaseOrderRow {
  status: string;
}

interface CalculatedLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

const MAX_DECIMAL_19_4_SCALED =
  9_999_999_999_999_999_999n;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(query: PurchaseOrderQueryDto) {
    this.assertSort(query.sort);
    this.assertDateRange(
      query.dateFrom,
      query.dateTo,
    );

    const { skip, take } =
      toPaginationWindow(query);
    const search = query.search?.trim();
    const dateFrom = query.dateFrom
      ? this.parseDateOnly(query.dateFrom, 'dateFrom')
      : null;
    const dateTo = query.dateTo
      ? this.addDays(
          this.parseDateOnly(
            query.dateTo,
            'dateTo',
          ),
          1,
        )
      : null;

    const where = {
      ...(query.supplierId
        ? { supplierId: query.supplierId }
        : {}),
      ...(query.warehouseId
        ? { warehouseId: query.warehouseId }
        : {}),
      ...(query.status
        ? {
            status:
              PURCHASE_ORDER_STATUS_TO_DB[
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
                supplier: {
                  code: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                supplier: {
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
        this.prisma.purchaseOrder.findMany({
          where,
          skip,
          take,
          orderBy: this.orderBy(
            query.sort,
            query.resolvedOrder,
          ),
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
            _count: {
              select: { lines: true },
            },
          },
        }),
        this.prisma.purchaseOrder.count({
          where,
        }),
      ]);

    return toPaginatedResult(
      items.map((item) =>
        this.toSummary(
          item as PurchaseOrderSummaryRecord,
        ),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const item =
      await this.prisma.purchaseOrder.findUnique({
        where: { id },
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
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          submittedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          approvedBy: {
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
      item as PurchaseOrderDetailRecord,
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
      currencyCode: this.currencyCode(),
    };
  }

  async supplierOptions(
    query: PurchaseOrderLookupQueryDto,
  ) {
    const search = query.search.trim();

    return this.prisma.supplier.findMany({
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

  async productOptions(
    query: PurchaseOrderLookupQueryDto,
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
        orderBy: [
          { name: 'asc' },
          { sku: 'asc' },
        ],
        take: query.limit,
        select: {
          id: true,
          sku: true,
          name: true,
          costPrice: true,
          unit: {
            select: {
              symbol: true,
            },
          },
        },
      });

    return products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      ...(product.unit
        ? {
            unitSymbol:
              product.unit.symbol,
          }
        : {}),
      defaultUnitPrice: Number(
        product.costPrice.toString(),
      ),
    }));
  }

  async create(
    dto: PurchaseOrderUpsertDto,
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
            'SELECT nextval(\'purchase_order_number_seq\') AS "value"',
          );
        const value = sequence[0]?.value;

        if (value === undefined) {
          throw new ConflictException({
            code: 'PURCHASE_ORDER_NUMBER_UNAVAILABLE',
            message:
              'Unable to allocate a purchase order number',
          });
        }

        const number =
          'PO-' +
          value.toString().padStart(8, '0');

        const item =
          await tx.purchaseOrder.create({
            data: {
              number,
              supplierId: dto.supplierId,
              warehouseId:
                dto.warehouseId,
              orderDate:
                prepared.orderDate,
              expectedDate:
                prepared.expectedDate,
              notes: dto.notes ?? null,
              subtotal: prepared.subtotal,
              currencyCode:
                this.currencyCode(),
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
            select: { id: true },
          });

        return item.id;
      },
    );

    return this.get(id);
  }

  async update(
    id: string,
    dto: PurchaseOrderUpsertDto,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'DRAFT',
        );

        const prepared =
          await this.prepareDraft(tx, dto);

        await tx.purchaseOrder.update({
          where: { id },
          data: {
            supplierId: dto.supplierId,
            warehouseId: dto.warehouseId,
            orderDate: prepared.orderDate,
            expectedDate:
              prepared.expectedDate,
            notes: dto.notes ?? null,
            subtotal: prepared.subtotal,
          },
        });

        await tx.purchaseOrderLine.deleteMany({
          where: { purchaseOrderId: id },
        });

        await tx.purchaseOrderLine.createMany({
          data: prepared.lines.map(
            (line) => ({
              purchaseOrderId: id,
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
      },
    );

    return this.get(id);
  }

  async submit(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'DRAFT',
        );

        await this.validatePersisted(
          tx,
          id,
        );

        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            submittedByUserId: userId,
          },
        });
      },
    );

    return this.get(id);
  }

  async approve(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'SUBMITTED',
        );

        await this.validatePersisted(
          tx,
          id,
        );

        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedByUserId: userId,
          },
        });
      },
    );

    return this.get(id);
  }

  private async prepareDraft(
    tx: Prisma.TransactionClient,
    dto: PurchaseOrderUpsertDto,
  ) {
    const orderDate = this.parseDateOnly(
      dto.orderDate,
      'orderDate',
    );
    const expectedDate = dto.expectedDate
      ? this.parseDateOnly(
          dto.expectedDate,
          'expectedDate',
        )
      : null;

    if (
      expectedDate &&
      expectedDate < orderDate
    ) {
      throw new BadRequestException({
        code: 'INVALID_EXPECTED_DATE',
        message:
          'Expected date cannot be before the order date',
        fields: {
          expectedDate: [
            'Expected date cannot be before the order date.',
          ],
        },
      });
    }

    const duplicate =
      this.findDuplicateProduct(dto.lines);

    if (duplicate) {
      throw new BadRequestException({
        code: 'PURCHASE_ORDER_DUPLICATE_PRODUCT',
        message:
          'A product can appear only once in a purchase order',
        fields: {
          lines: [
            'Remove duplicate product lines.',
          ],
        },
        details: { productId: duplicate },
      });
    }

    const [supplier, warehouse] =
      await Promise.all([
        tx.supplier.findUnique({
          where: {
            id: dto.supplierId,
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

    if (!supplier || !supplier.isActive) {
      throw new BadRequestException({
        code: 'PURCHASE_ORDER_SUPPLIER_UNAVAILABLE',
        message:
          'Purchase orders require an active supplier',
        fields: {
          supplierId: [
            'Select an active supplier.',
          ],
        },
      });
    }

    if (
      !warehouse ||
      !warehouse.isActive
    ) {
      throw new BadRequestException({
        code: 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE',
        message:
          'Purchase orders require an active receiving warehouse',
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
        code: 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE',
        message:
          'All purchase-order products must be active and trackable',
        fields: {
          lines: [
            'One or more selected products are unavailable.',
          ],
        },
      });
    }

    const lines = dto.lines.map(
      (line) =>
        this.calculateLine(line),
    );
    const subtotal = this.sumLineTotals(
      lines,
    );

    return {
      orderDate,
      expectedDate,
      lines,
      subtotal,
    };
  }

  private async validatePersisted(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const item =
      await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          supplier: {
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

    if (!item) {
      throw this.notFound();
    }

    if (!item.supplier.isActive) {
      throw new ConflictException({
        code: 'PURCHASE_ORDER_SUPPLIER_UNAVAILABLE',
        message:
          'The supplier is no longer active',
      });
    }

    if (!item.warehouse.isActive) {
      throw new ConflictException({
        code: 'PURCHASE_ORDER_WAREHOUSE_UNAVAILABLE',
        message:
          'The receiving warehouse is no longer active',
      });
    }

    if (item.lines.length === 0) {
      throw new ConflictException({
        code: 'PURCHASE_ORDER_LINES_REQUIRED',
        message:
          'A purchase order requires at least one line',
      });
    }

    if (
      item.expectedDate &&
      item.expectedDate <
        item.orderDate
    ) {
      throw new ConflictException({
        code: 'INVALID_EXPECTED_DATE',
        message:
          'Expected date cannot be before the order date',
      });
    }

    for (const line of item.lines) {
      if (
        !line.product.isActive ||
        !line.product.isTrackable
      ) {
        throw new ConflictException({
          code: 'PURCHASE_ORDER_PRODUCT_UNAVAILABLE',
          message:
            'All products must remain active and trackable before this workflow transition',
          details: {
            productId:
              line.productId,
          },
        });
      }

      if (
        Number(
          line.quantity.toString(),
        ) <= 0 ||
        Number(
          line.unitPrice.toString(),
        ) < 0
      ) {
        throw new ConflictException({
          code: 'PURCHASE_ORDER_LINE_INVALID',
          message:
            'Purchase-order line quantities and prices are invalid',
          details: {
            productId:
              line.productId,
          },
        });
      }
    }
  }

  private async lockWithStatus(
    tx: Prisma.TransactionClient,
    id: string,
    requiredStatus: 'DRAFT' | 'SUBMITTED',
  ): Promise<void> {
    const rows =
      await tx.$queryRawUnsafe<
        LockedPurchaseOrderRow[]
      >(
        [
          'SELECT "status"::text AS "status"',
          'FROM "purchase_orders"',
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
        code: 'PURCHASE_ORDER_INVALID_STATUS',
        message:
          requiredStatus === 'DRAFT'
            ? 'Only draft purchase orders can be changed or submitted'
            : 'Only submitted purchase orders can be approved',
        details: {
          requiredStatus:
            requiredStatus.toLowerCase(),
          currentStatus:
            row.status.toLowerCase(),
        },
      });
    }
  }

  private calculateLine(
    line: PurchaseOrderLineDto,
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
        code: 'PURCHASE_ORDER_LINE_TOTAL_TOO_LARGE',
        message:
          'A purchase-order line total exceeds the supported monetary range',
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
          code: 'PURCHASE_ORDER_SUBTOTAL_TOO_LARGE',
          message:
            'Purchase-order subtotal exceeds the supported monetary range',
          fields: {
            lines: [
              'Reduce the purchase-order quantities or prices.',
            ],
          },
        });
      }
    }

    return this.formatScaled4(total);
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

    return negative ? -scaled : scaled;
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

  private dateOnly(
    date: Date,
  ): string {
    return date
      .toISOString()
      .slice(0, 10);
  }

  private toSummary(
    item: PurchaseOrderSummaryRecord,
  ) {
    return {
      id: item.id,
      number: item.number,
      supplierId: item.supplierId,
      supplierCode:
        item.supplier.code,
      supplierName:
        item.supplier.name,
      warehouseId: item.warehouseId,
      warehouseCode:
        item.warehouse.code,
      warehouseName:
        item.warehouse.name,
      orderDate:
        this.dateOnly(item.orderDate),
      ...(item.expectedDate
        ? {
            expectedDate:
              this.dateOnly(
                item.expectedDate,
              ),
          }
        : {}),
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
      ...(item.submittedAt
        ? {
            submittedAt:
              item.submittedAt,
          }
        : {}),
      ...(item.approvedAt
        ? {
            approvedAt:
              item.approvedAt,
          }
        : {}),
    };
  }

  private toDetail(
    item: PurchaseOrderDetailRecord,
  ) {
    return {
      ...this.toSummary(item),
      ...(item.notes
        ? { notes: item.notes }
        : {}),
      lines: item.lines.map(
        (line) => {
          const quantityText =
            line.quantity.toString();
          const receivedText =
            line.quantityReceived.toString();
          const quantity = Number(
            quantityText,
          );
          const received = Number(
            receivedText,
          );
          const remainingScaled =
            this.parseScaled4(quantityText) -
            this.parseScaled4(receivedText);

          return {
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
            quantity,
            unitPrice: Number(
              line.unitPrice.toString(),
            ),
            lineTotal: Number(
              line.lineTotal.toString(),
            ),
            quantityReceived:
              received,
            quantityRemaining: Number(
              this.formatScaled4(
                remainingScaled < 0n
                  ? 0n
                  : remainingScaled,
              ),
            ),
          };
        },
      ),
      createdBy: this.actor(
        item.createdBy,
      ),
      ...(item.submittedBy
        ? {
            submittedBy:
              this.actor(
                item.submittedBy,
              ),
          }
        : {}),
      ...(item.approvedBy
        ? {
            approvedBy:
              this.actor(
                item.approvedBy,
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
      PURCHASE_ORDER_STATUS_FROM_DB[
        status as keyof typeof PURCHASE_ORDER_STATUS_FROM_DB
      ];

    if (!value) {
      throw new Error(
        'Unsupported purchase order status: ' +
          status,
      );
    }

    return value;
  }

  private currencyCode(): string {
    return (
      this.config.get<string>(
        'app.currencyCode',
      ) ?? 'AED'
    );
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
      case 'supplierName':
        return {
          supplier: { name: order },
        };
      case 'warehouseName':
        return {
          warehouse: { name: order },
        };
      case 'orderDate':
        return { orderDate: order };
      case 'expectedDate':
        return {
          expectedDate: order,
        };
      case 'subtotal':
        return { subtotal: order };
      case 'status':
        return { status: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for purchase orders',
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
        'supplierName',
        'warehouseName',
        'orderDate',
        'expectedDate',
        'subtotal',
        'status',
      ].includes(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for purchase orders',
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

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PURCHASE_ORDER_NOT_FOUND',
      message:
        'Purchase order was not found',
    });
  }
}
