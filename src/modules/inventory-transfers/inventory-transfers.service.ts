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
import type { InventoryTransferProductQueryDto } from './dto/inventory-transfer-product-query.dto.js';
import type { InventoryTransferQueryDto } from './dto/inventory-transfer-query.dto.js';
import type { InventoryTransferUpsertDto } from './dto/inventory-transfer-upsert.dto.js';
import {
  TRANSFER_STATUS_FROM_DB,
  TRANSFER_STATUS_TO_DB,
} from './inventory-transfer.constants.js';

interface DecimalLike {
  toString(): string;
}

interface TransferSummaryRecord {
  id: string;
  number: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  notes: string | null;
  status: string;
  createdAt: Date;
  postedAt: Date | null;
  sourceWarehouse: {
    code: string;
    name: string;
  };
  destinationWarehouse: {
    code: string;
    name: string;
  };
  _count: {
    lines: number;
  };
}

interface TransferDetailRecord
  extends TransferSummaryRecord {
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
    productId: string;
    quantity: DecimalLike;
    sourceBalanceBefore: DecimalLike | null;
    sourceBalanceAfter: DecimalLike | null;
    destinationBalanceBefore: DecimalLike | null;
    destinationBalanceAfter: DecimalLike | null;
    product: {
      sku: string;
      name: string;
      unit: {
        symbol: string;
      } | null;
    };
    outboundMovement: {
      id: string;
    } | null;
    inboundMovement: {
      id: string;
    } | null;
  }>;
}

interface SequenceRow {
  value: bigint;
}

interface LockedTransferRow {
  status: string;
}

interface LockedBalanceRow {
  quantityOnHand: string;
  quantityReserved: string;
  averageCost: string;
}

@Injectable()
export class InventoryTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: StockMovementsService,
  ) {}

  async list(query: InventoryTransferQueryDto) {
    this.assertSort(query.sort);
    this.assertDateRange(
      query.dateFrom,
      query.dateTo,
    );

    const { skip, take } =
      toPaginationWindow(query);
    const search = query.search?.trim();
    const dateFrom = this.resolveDateFrom(
      query.dateFrom,
    );
    const dateTo = this.resolveDateToExclusive(
      query.dateTo,
    );

    const where = {
      ...(query.sourceWarehouseId
        ? {
            sourceWarehouseId:
              query.sourceWarehouseId,
          }
        : {}),
      ...(query.destinationWarehouseId
        ? {
            destinationWarehouseId:
              query.destinationWarehouseId,
          }
        : {}),
      ...(query.status
        ? {
            status:
              TRANSFER_STATUS_TO_DB[
                query.status
              ],
          }
        : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
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
                sourceWarehouse: {
                  code: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                sourceWarehouse: {
                  name: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                destinationWarehouse: {
                  code: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                destinationWarehouse: {
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

    const [transfers, totalItems] =
      await this.prisma.$transaction([
        this.prisma.inventoryTransfer.findMany({
          where,
          skip,
          take,
          orderBy: this.orderBy(
            query.sort,
            query.resolvedOrder,
          ),
          include: {
            sourceWarehouse: {
              select: {
                code: true,
                name: true,
              },
            },
            destinationWarehouse: {
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
        this.prisma.inventoryTransfer.count({
          where,
        }),
      ]);

    return toPaginatedResult(
      transfers.map((transfer) =>
        this.toSummary(
          transfer as TransferSummaryRecord,
        ),
      ),
      totalItems,
      query,
    );
  }

  async get(id: string) {
    const transfer =
      await this.prisma.inventoryTransfer.findUnique({
        where: { id },
        include: {
          sourceWarehouse: {
            select: {
              code: true,
              name: true,
            },
          },
          destinationWarehouse: {
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
              outboundMovement: {
                select: { id: true },
              },
              inboundMovement: {
                select: { id: true },
              },
            },
          },
          _count: {
            select: { lines: true },
          },
        },
      });

    if (!transfer) {
      throw this.notFound();
    }

    return this.toDetail(
      transfer as TransferDetailRecord,
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

  async productOptions(
    query: InventoryTransferProductQueryDto,
  ) {
    const warehouse =
      await this.prisma.warehouse.findUnique({
        where: {
          id: query.sourceWarehouseId,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException({
        code: 'TRANSFER_SOURCE_UNAVAILABLE',
        message:
          'Product lookup requires an active source warehouse',
        fields: {
          sourceWarehouseId: [
            'Select an active source warehouse.',
          ],
        },
      });
    }

    const search = query.search.trim();
    const balances =
      await this.prisma.inventoryItem.findMany({
        where: {
          warehouseId:
            query.sourceWarehouseId,
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
        Number(balance.quantityOnHand.toString()) -
        Number(
          balance.quantityReserved.toString(),
        ),
    }));
  }

  async create(
    dto: InventoryTransferUpsertDto,
    userId: string,
  ) {
    const transferId =
      await this.prisma.$transaction(
        async (tx) => {
          await this.validateDraft(tx, dto);

          const sequence =
            await tx.$queryRawUnsafe<
              SequenceRow[]
            >(
              'SELECT nextval(\'inventory_transfer_number_seq\') AS "value"',
            );
          const value = sequence[0]?.value;

          if (value === undefined) {
            throw new ConflictException({
              code: 'TRANSFER_NUMBER_UNAVAILABLE',
              message:
                'Unable to allocate an inventory transfer number',
            });
          }

          const number =
            'TRF-' +
            value.toString().padStart(8, '0');

          const transfer =
            await tx.inventoryTransfer.create({
              data: {
                number,
                sourceWarehouseId:
                  dto.sourceWarehouseId,
                destinationWarehouseId:
                  dto.destinationWarehouseId,
                notes: dto.notes ?? null,
                createdByUserId: userId,
                lines: {
                  create: dto.lines.map(
                    (line) => ({
                      productId:
                        line.productId,
                      quantity:
                        line.quantity,
                    }),
                  ),
                },
              },
              select: { id: true },
            });

          return transfer.id;
        },
      );

    return this.get(transferId);
  }

  async update(
    id: string,
    dto: InventoryTransferUpsertDto,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockDraft(tx, id);
        await this.validateDraft(tx, dto);

        await tx.inventoryTransfer.update({
          where: { id },
          data: {
            sourceWarehouseId:
              dto.sourceWarehouseId,
            destinationWarehouseId:
              dto.destinationWarehouseId,
            notes: dto.notes ?? null,
          },
        });

        await tx.inventoryTransferLine.deleteMany({
          where: { transferId: id },
        });

        await tx.inventoryTransferLine.createMany({
          data: dto.lines.map((line) => ({
            transferId: id,
            productId: line.productId,
            quantity: line.quantity,
          })),
        });
      },
    );

    return this.get(id);
  }

  async post(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockDraft(tx, id);

        const transfer =
          await tx.inventoryTransfer.findUnique({
            where: { id },
            include: {
              sourceWarehouse: {
                select: {
                  isActive: true,
                },
              },
              destinationWarehouse: {
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

        if (!transfer) {
          throw this.notFound();
        }

        if (
          transfer.sourceWarehouseId ===
          transfer.destinationWarehouseId
        ) {
          throw this.sameWarehouse();
        }

        if (
          !transfer.sourceWarehouse.isActive ||
          !transfer.destinationWarehouse.isActive
        ) {
          throw new ConflictException({
            code: 'TRANSFER_WAREHOUSE_UNAVAILABLE',
            message:
              'Both transfer warehouses must remain active before posting',
          });
        }

        if (transfer.lines.length === 0) {
          throw new ConflictException({
            code: 'TRANSFER_LINES_REQUIRED',
            message:
              'A transfer requires at least one product line',
          });
        }

        const duplicate =
          this.findDuplicateProduct(
            transfer.lines,
          );

        if (duplicate) {
          throw this.duplicateProduct(duplicate);
        }

        for (const line of transfer.lines) {
          if (
            !line.product.isActive ||
            !line.product.isTrackable
          ) {
            throw new ConflictException({
              code: 'TRANSFER_PRODUCT_UNAVAILABLE',
              message:
                'All transfer products must remain active and trackable before posting',
              details: {
                productId: line.productId,
              },
            });
          }

          if (
            Number(line.quantity.toString()) <=
            0
          ) {
            throw new ConflictException({
              code: 'TRANSFER_QUANTITY_INVALID',
              message:
                'Transfer quantities must be greater than zero',
              details: {
                productId: line.productId,
              },
            });
          }
        }

        const sortedLines = [
          ...transfer.lines,
        ].sort((a, b) =>
          a.productId.localeCompare(
            b.productId,
          ),
        );

        await this.movements.assertWarehousesMovementAllowedInTransaction(
          tx,
          [
            transfer.sourceWarehouseId,
            transfer.destinationWarehouseId,
          ],
        );

        await this.acquireTransferLocks(
          tx,
          sortedLines.map(
            (line) => line.productId,
          ),
          transfer.sourceWarehouseId,
          transfer.destinationWarehouseId,
        );

        const sourceBalances =
          new Map<
            string,
            LockedBalanceRow
          >();

        for (const line of sortedLines) {
          const source =
            await this.lockBalance(
              tx,
              line.productId,
              transfer.sourceWarehouseId,
            );

          if (!source) {
            throw this.insufficientStock(
              line.productId,
              0,
              Number(
                line.quantity.toString(),
              ),
            );
          }

          sourceBalances.set(
            line.productId,
            source,
          );

          await this.ensureBalance(
            tx,
            line.productId,
            transfer.destinationWarehouseId,
          );

          const destination =
            await this.lockBalance(
              tx,
              line.productId,
              transfer.destinationWarehouseId,
            );

          if (!destination) {
            throw new ConflictException({
              code: 'TRANSFER_DESTINATION_BALANCE_UNAVAILABLE',
              message:
                'Destination inventory balance could not be prepared',
              details: {
                productId: line.productId,
              },
            });
          }
        }

        for (const line of sortedLines) {
          const source =
            sourceBalances.get(
              line.productId,
            );

          if (!source) {
            throw new ConflictException({
              code: 'TRANSFER_SOURCE_BALANCE_UNAVAILABLE',
              message:
                'Source inventory balance could not be locked',
            });
          }

          const quantity = Number(
            line.quantity.toString(),
          );
          const available =
            Number(
              source.quantityOnHand,
            ) -
            Number(
              source.quantityReserved,
            );

          if (available < quantity) {
            throw this.insufficientStock(
              line.productId,
              available,
              quantity,
            );
          }
        }

        const occurredAt = new Date();

        for (const line of sortedLines) {
          const source =
            sourceBalances.get(
              line.productId,
            )!;
          const quantity = Number(
            line.quantity.toString(),
          );
          const unitCost = Number(
            source.averageCost,
          );
          const reference = {
            type: 'inventory-transfer',
            id: transfer.id,
            number: transfer.number,
            referencePath:
              '/transfers/' + transfer.id,
          };

          const outbound =
            await this.movements.applyMovementInTransaction(
              tx,
              {
                productId: line.productId,
                warehouseId:
                  transfer.sourceWarehouseId,
                type: 'transfer-out',
                quantityChange: -quantity,
                unitCost,
                reference,
                notes:
                  transfer.notes ?? undefined,
                performedByUserId: userId,
                occurredAt,
              },
            );

          const inbound =
            await this.movements.applyMovementInTransaction(
              tx,
              {
                productId: line.productId,
                warehouseId:
                  transfer.destinationWarehouseId,
                type: 'transfer-in',
                quantityChange: quantity,
                unitCost,
                reference,
                notes:
                  transfer.notes ?? undefined,
                performedByUserId: userId,
                occurredAt,
              },
            );

          await tx.inventoryTransferLine.update({
            where: { id: line.id },
            data: {
              sourceBalanceBefore:
                outbound.balanceBefore,
              sourceBalanceAfter:
                outbound.balanceAfter,
              destinationBalanceBefore:
                inbound.balanceBefore,
              destinationBalanceAfter:
                inbound.balanceAfter,
              outboundMovementId:
                outbound.id,
              inboundMovementId:
                inbound.id,
            },
          });
        }

        await tx.inventoryTransfer.update({
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

  private async validateDraft(
    tx: Prisma.TransactionClient,
    dto: InventoryTransferUpsertDto,
  ): Promise<void> {
    if (
      dto.sourceWarehouseId ===
      dto.destinationWarehouseId
    ) {
      throw this.sameWarehouse();
    }

    if (dto.lines.length === 0) {
      throw new BadRequestException({
        code: 'TRANSFER_LINES_REQUIRED',
        message:
          'A transfer requires at least one product line',
        fields: {
          lines: [
            'Add at least one product to the transfer.',
          ],
        },
      });
    }

    const duplicate =
      this.findDuplicateProduct(dto.lines);

    if (duplicate) {
      throw this.duplicateProduct(duplicate);
    }

    const [source, destination] =
      await Promise.all([
        tx.warehouse.findUnique({
          where: {
            id: dto.sourceWarehouseId,
          },
          select: {
            id: true,
            isActive: true,
          },
        }),
        tx.warehouse.findUnique({
          where: {
            id: dto.destinationWarehouseId,
          },
          select: {
            id: true,
            isActive: true,
          },
        }),
      ]);

    if (!source || !source.isActive) {
      throw new BadRequestException({
        code: 'TRANSFER_SOURCE_UNAVAILABLE',
        message:
          'Transfers require an active source warehouse',
        fields: {
          sourceWarehouseId: [
            'Select an active source warehouse.',
          ],
        },
      });
    }

    if (
      !destination ||
      !destination.isActive
    ) {
      throw new BadRequestException({
        code: 'TRANSFER_DESTINATION_UNAVAILABLE',
        message:
          'Transfers require an active destination warehouse',
        fields: {
          destinationWarehouseId: [
            'Select an active destination warehouse.',
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
      products.length !== productIds.length
    ) {
      throw new BadRequestException({
        code: 'TRANSFER_PRODUCT_UNAVAILABLE',
        message:
          'All transfer products must be active and trackable',
        fields: {
          lines: [
            'One or more selected products are unavailable.',
          ],
        },
      });
    }

    const sourceBalances =
      await tx.inventoryItem.findMany({
        where: {
          warehouseId:
            dto.sourceWarehouseId,
          productId: {
            in: productIds,
          },
        },
        select: {
          productId: true,
        },
      });

    const availableProducts = new Set(
      sourceBalances.map(
        (item) => item.productId,
      ),
    );

    const missing = productIds.find(
      (productId) =>
        !availableProducts.has(productId),
    );

    if (missing) {
      throw new BadRequestException({
        code: 'TRANSFER_SOURCE_PRODUCT_UNAVAILABLE',
        message:
          'A selected product does not have an inventory balance in the source warehouse',
        fields: {
          lines: [
            'Select products available in the source warehouse.',
          ],
        },
        details: {
          productId: missing,
        },
      });
    }
  }

  private async lockDraft(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const rows =
      await tx.$queryRawUnsafe<
        LockedTransferRow[]
      >(
        [
          'SELECT "status"::text AS "status"',
          'FROM "inventory_transfers"',
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
      throw this.notDraft();
    }
  }

  private async acquireTransferLocks(
    tx: Prisma.TransactionClient,
    productIds: string[],
    sourceWarehouseId: string,
    destinationWarehouseId: string,
  ): Promise<void> {
    const keys = productIds
      .flatMap((productId) => [
        productId + ':' + sourceWarehouseId,
        productId +
          ':' +
          destinationWarehouseId,
      ])
      .sort();

    for (const key of keys) {
      await tx.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',
        key,
      );
    }
  }

  private async ensureBalance(
    tx: Prisma.TransactionClient,
    productId: string,
    warehouseId: string,
  ): Promise<void> {
    await tx.inventoryItem.upsert({
      where: {
        productId_warehouseId: {
          productId,
          warehouseId,
        },
      },
      update: {},
      create: {
        productId,
        warehouseId,
      },
    });
  }

  private async lockBalance(
    tx: Prisma.TransactionClient,
    productId: string,
    warehouseId: string,
  ): Promise<LockedBalanceRow | null> {
    const rows =
      await tx.$queryRawUnsafe<
        LockedBalanceRow[]
      >(
        [
          'SELECT',
          '  "quantity_on_hand"::text AS "quantityOnHand",',
          '  "quantity_reserved"::text AS "quantityReserved",',
          '  "average_cost"::text AS "averageCost"',
          'FROM "inventory_items"',
          'WHERE "product_id" = $1::uuid',
          '  AND "warehouse_id" = $2::uuid',
          'FOR UPDATE',
        ].join('\n'),
        productId,
        warehouseId,
      );

    return rows[0] ?? null;
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

  private toSummary(
    transfer: TransferSummaryRecord,
  ) {
    return {
      id: transfer.id,
      number: transfer.number,
      sourceWarehouseId:
        transfer.sourceWarehouseId,
      sourceWarehouseCode:
        transfer.sourceWarehouse.code,
      sourceWarehouseName:
        transfer.sourceWarehouse.name,
      destinationWarehouseId:
        transfer.destinationWarehouseId,
      destinationWarehouseCode:
        transfer.destinationWarehouse.code,
      destinationWarehouseName:
        transfer.destinationWarehouse.name,
      lineCount: transfer._count.lines,
      status: this.statusFromDb(
        transfer.status,
      ),
      createdAt: transfer.createdAt,
      ...(transfer.postedAt
        ? { postedAt: transfer.postedAt }
        : {}),
    };
  }

  private toDetail(
    transfer: TransferDetailRecord,
  ) {
    return {
      ...this.toSummary(transfer),
      ...(transfer.notes
        ? { notes: transfer.notes }
        : {}),
      lines: transfer.lines.map(
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
          ...(line.sourceBalanceBefore !==
          null
            ? {
                sourceBalanceBefore:
                  Number(
                    line.sourceBalanceBefore.toString(),
                  ),
              }
            : {}),
          ...(line.sourceBalanceAfter !==
          null
            ? {
                sourceBalanceAfter:
                  Number(
                    line.sourceBalanceAfter.toString(),
                  ),
              }
            : {}),
          ...(line.destinationBalanceBefore !==
          null
            ? {
                destinationBalanceBefore:
                  Number(
                    line.destinationBalanceBefore.toString(),
                  ),
              }
            : {}),
          ...(line.destinationBalanceAfter !==
          null
            ? {
                destinationBalanceAfter:
                  Number(
                    line.destinationBalanceAfter.toString(),
                  ),
              }
            : {}),
          ...(line.outboundMovement
            ? {
                outboundMovement: {
                  id:
                    line.outboundMovement.id,
                },
              }
            : {}),
          ...(line.inboundMovement
            ? {
                inboundMovement: {
                  id:
                    line.inboundMovement.id,
                },
              }
            : {}),
        }),
      ),
      createdBy: this.actor(
        transfer.createdBy,
      ),
      ...(transfer.postedBy
        ? {
            postedBy: this.actor(
              transfer.postedBy,
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

  private statusFromDb(status: string) {
    const value =
      TRANSFER_STATUS_FROM_DB[
        status as keyof typeof TRANSFER_STATUS_FROM_DB
      ];

    if (!value) {
      throw new Error(
        'Unsupported inventory transfer status: ' +
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
      case 'sourceWarehouseName':
        return {
          sourceWarehouse: {
            name: order,
          },
        };
      case 'destinationWarehouseName':
        return {
          destinationWarehouse: {
            name: order,
          },
        };
      case 'status':
        return { status: order };
      case 'postedAt':
        return { postedAt: order };
      default:
        throw new ApiException({
          code: 'INVALID_SORT_FIELD',
          message:
            'Unsupported sort field for inventory transfers',
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
        'sourceWarehouseName',
        'destinationWarehouseName',
        'status',
        'postedAt',
      ].includes(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for inventory transfers',
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

    const from =
      this.resolveDateFrom(dateFrom);
    const to =
      this.resolveDateToExclusive(dateTo);

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

    if (
      /^\d{4}-\d{2}-\d{2}$/.test(
        value,
      )
    ) {
      const date = new Date(
        value + 'T00:00:00.000Z',
      );
      date.setUTCDate(
        date.getUTCDate() + 1,
      );
      return date;
    }

    return new Date(
      new Date(value).getTime() + 1,
    );
  }

  private insufficientStock(
    productId: string,
    available: number,
    required: number,
  ): ConflictException {
    return new ConflictException({
      code:
        'TRANSFER_INSUFFICIENT_AVAILABLE_STOCK',
      message:
        'Source warehouse does not have enough available stock for this transfer',
      details: {
        productId,
        available,
        required,
      },
    });
  }

  private duplicateProduct(
    productId: string,
  ): BadRequestException {
    return new BadRequestException({
      code: 'TRANSFER_DUPLICATE_PRODUCT',
      message:
        'A product can appear only once in a transfer',
      fields: {
        lines: [
          'Remove duplicate product lines.',
        ],
      },
      details: { productId },
    });
  }

  private sameWarehouse(): BadRequestException {
    return new BadRequestException({
      code: 'TRANSFER_WAREHOUSES_MUST_DIFFER',
      message:
        'Source and destination warehouses must be different',
      fields: {
        destinationWarehouseId: [
          'Select a different destination warehouse.',
        ],
      },
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'INVENTORY_TRANSFER_NOT_FOUND',
      message:
        'Inventory transfer was not found',
    });
  }

  private notDraft(): ConflictException {
    return new ConflictException({
      code: 'INVENTORY_TRANSFER_NOT_DRAFT',
      message:
        'Only draft inventory transfers can be changed or posted',
    });
  }
}
