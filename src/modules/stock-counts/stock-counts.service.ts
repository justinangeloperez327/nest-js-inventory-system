import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ApiException } from '../../common/exceptions/api.exception.js';
import { toPaginatedResult } from '../../common/utils/pagination.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { StockMovementsService } from '../stock-movements/stock-movements.service.js';
import type { StockCountCreateDto } from './dto/stock-count-create.dto.js';
import type { StockCountLineQueryDto } from './dto/stock-count-line-query.dto.js';
import type { StockCountLinesUpdateDto } from './dto/stock-count-line-update.dto.js';
import type { StockCountQueryDto } from './dto/stock-count-query.dto.js';
import {
  STOCK_COUNT_STATUS_FROM_DB,
  STOCK_COUNT_STATUS_TO_DB,
} from './stock-count.constants.js';

interface SummaryRow {
  id: string;
  number: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  status: keyof typeof STOCK_COUNT_STATUS_FROM_DB;
  lineCount: number;
  countedLineCount: number;
  varianceLineCount: number;
  createdAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  postedAt: Date | null;
}

interface CountRow {
  totalItems: number;
}

interface LineRow {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unitSymbol: string | null;
  expectedQuantity: string;
  countedQuantity: string | null;
  varianceQuantity: string | null;
  movementId: string | null;
  movementNumber: string | null;
}

interface LineStatsRow {
  lineCount: number;
  countedLineCount: number;
  varianceLineCount: number;
}

interface LockedCountRow {
  status: string;
  warehouseId: string;
  number: string;
  startedAt: Date | null;
}

interface SnapshotRow {
  productId: string;
  expectedQuantity: string;
  snapshotUnitCost: string;
}

interface PostLineRow {
  id: string;
  productId: string;
  expectedQuantity: string;
  countedQuantity: string | null;
  varianceQuantity: string | null;
  snapshotUnitCost: string;
  movementId: string | null;
  currentQuantity: string | null;
}

interface ExistsRow {
  exists: boolean;
}

interface DbTimeRow {
  value: Date;
}

interface ActorRecord {
  id: string;
  firstName: string;
  lastName: string;
}

interface StockCountDetailRecord {
  id: string;
  number: string;
  warehouseId: string;
  notes: string | null;
  status: keyof typeof STOCK_COUNT_STATUS_FROM_DB;
  createdAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  postedAt: Date | null;
  warehouse: {
    code: string;
    name: string;
  };
  createdBy: ActorRecord;
  startedBy: ActorRecord | null;
  submittedBy: ActorRecord | null;
  approvedBy: ActorRecord | null;
}

interface SequenceRow {
  value: bigint;
}

const SUMMARY_SELECT = [
  'SELECT',
  '  sc."id"::text AS "id",',
  '  sc."number" AS "number",',
  '  sc."warehouse_id"::text AS "warehouseId",',
  '  w."code" AS "warehouseCode",',
  '  w."name" AS "warehouseName",',
  '  sc."status"::text AS "status",',
  '  COUNT(scl."id")::integer AS "lineCount",',
  '  COUNT(scl."id") FILTER (WHERE scl."counted_quantity" IS NOT NULL)::integer AS "countedLineCount",',
  '  COUNT(scl."id") FILTER (WHERE scl."variance_quantity" IS NOT NULL AND scl."variance_quantity" <> 0)::integer AS "varianceLineCount",',
  '  sc."created_at" AS "createdAt",',
  '  sc."started_at" AS "startedAt",',
  '  sc."submitted_at" AS "submittedAt",',
  '  sc."posted_at" AS "postedAt"',
].join('\n');

const SUMMARY_FROM = [
  'FROM "stock_counts" sc',
  'INNER JOIN "warehouses" w ON w."id" = sc."warehouse_id"',
  'LEFT JOIN "stock_count_lines" scl ON scl."stock_count_id" = sc."id"',
].join('\n');

const SUMMARY_FILTERS = [
  'WHERE ($1::uuid IS NULL OR sc."warehouse_id" = $1::uuid)',
  '  AND ($2::text IS NULL OR sc."status"::text = $2::text)',
  '  AND ($3::timestamptz IS NULL OR sc."created_at" >= $3::timestamptz)',
  '  AND ($4::timestamptz IS NULL OR sc."created_at" < $4::timestamptz)',
  '  AND (',
  '    $5::text IS NULL',
  '    OR sc."number" ILIKE $5',
  '    OR w."code" ILIKE $5',
  '    OR w."name" ILIKE $5',
  '  )',
].join('\n');

const SUMMARY_GROUP = [
  'GROUP BY',
  '  sc."id",',
  '  w."code",',
  '  w."name"',
].join('\n');

const SUMMARY_ORDER = [
  'ORDER BY',
  '  CASE WHEN $6::text = \'createdAt\' AND $7::text = \'asc\' THEN sc."created_at" END ASC,',
  '  CASE WHEN $6::text = \'createdAt\' AND $7::text = \'desc\' THEN sc."created_at" END DESC,',
  '  CASE WHEN $6::text = \'number\' AND $7::text = \'asc\' THEN sc."number" END ASC,',
  '  CASE WHEN $6::text = \'number\' AND $7::text = \'desc\' THEN sc."number" END DESC,',
  '  CASE WHEN $6::text = \'warehouseName\' AND $7::text = \'asc\' THEN w."name" END ASC,',
  '  CASE WHEN $6::text = \'warehouseName\' AND $7::text = \'desc\' THEN w."name" END DESC,',
  '  CASE WHEN $6::text = \'status\' AND $7::text = \'asc\' THEN sc."status"::text END ASC,',
  '  CASE WHEN $6::text = \'status\' AND $7::text = \'desc\' THEN sc."status"::text END DESC,',
  '  CASE WHEN $6::text = \'startedAt\' AND $7::text = \'asc\' THEN sc."started_at" END ASC,',
  '  CASE WHEN $6::text = \'startedAt\' AND $7::text = \'desc\' THEN sc."started_at" END DESC,',
  '  CASE WHEN $6::text = \'postedAt\' AND $7::text = \'asc\' THEN sc."posted_at" END ASC,',
  '  CASE WHEN $6::text = \'postedAt\' AND $7::text = \'desc\' THEN sc."posted_at" END DESC,',
  '  sc."id" ASC',
].join('\n');

const LIST_QUERY = [
  SUMMARY_SELECT,
  SUMMARY_FROM,
  SUMMARY_FILTERS,
  SUMMARY_GROUP,
  SUMMARY_ORDER,
  'LIMIT $8 OFFSET $9',
].join('\n');

const COUNT_QUERY = [
  'SELECT COUNT(*)::integer AS "totalItems"',
  'FROM "stock_counts" sc',
  'INNER JOIN "warehouses" w ON w."id" = sc."warehouse_id"',
  SUMMARY_FILTERS,
].join('\n');

const LINE_SELECT = [
  'SELECT',
  '  scl."id"::text AS "id",',
  '  scl."product_id"::text AS "productId",',
  '  p."sku" AS "sku",',
  '  p."name" AS "productName",',
  '  u."symbol" AS "unitSymbol",',
  '  scl."expected_quantity"::text AS "expectedQuantity",',
  '  scl."counted_quantity"::text AS "countedQuantity",',
  '  scl."variance_quantity"::text AS "varianceQuantity",',
  '  scl."movement_id"::text AS "movementId",',
  '  m."reference_number" AS "movementNumber"',
].join('\n');

const LINE_FROM = [
  'FROM "stock_count_lines" scl',
  'INNER JOIN "products" p ON p."id" = scl."product_id"',
  'LEFT JOIN "units" u ON u."id" = p."unit_id"',
  'LEFT JOIN "stock_movements" m ON m."id" = scl."movement_id"',
].join('\n');

const LINE_FILTERS = [
  'WHERE scl."stock_count_id" = $1::uuid',
  '  AND (',
  '    $2::text IS NULL',
  '    OR p."sku" ILIKE $2',
  '    OR p."name" ILIKE $2',
  '  )',
  '  AND (',
  '    NOT $3::boolean',
  '    OR (scl."variance_quantity" IS NOT NULL AND scl."variance_quantity" <> 0)',
  '  )',
].join('\n');

const LINE_ORDER = [
  'ORDER BY',
  '  CASE WHEN $4::text = \'productName\' AND $5::text = \'asc\' THEN p."name" END ASC,',
  '  CASE WHEN $4::text = \'productName\' AND $5::text = \'desc\' THEN p."name" END DESC,',
  '  CASE WHEN $4::text = \'sku\' AND $5::text = \'asc\' THEN p."sku" END ASC,',
  '  CASE WHEN $4::text = \'sku\' AND $5::text = \'desc\' THEN p."sku" END DESC,',
  '  CASE WHEN $4::text = \'expectedQuantity\' AND $5::text = \'asc\' THEN scl."expected_quantity" END ASC,',
  '  CASE WHEN $4::text = \'expectedQuantity\' AND $5::text = \'desc\' THEN scl."expected_quantity" END DESC,',
  '  CASE WHEN $4::text = \'countedQuantity\' AND $5::text = \'asc\' THEN scl."counted_quantity" END ASC NULLS LAST,',
  '  CASE WHEN $4::text = \'countedQuantity\' AND $5::text = \'desc\' THEN scl."counted_quantity" END DESC NULLS LAST,',
  '  CASE WHEN $4::text = \'varianceQuantity\' AND $5::text = \'asc\' THEN scl."variance_quantity" END ASC NULLS LAST,',
  '  CASE WHEN $4::text = \'varianceQuantity\' AND $5::text = \'desc\' THEN scl."variance_quantity" END DESC NULLS LAST,',
  '  p."name" ASC,',
  '  scl."id" ASC',
].join('\n');

const LINES_QUERY = [
  LINE_SELECT,
  LINE_FROM,
  LINE_FILTERS,
  LINE_ORDER,
  'LIMIT $6 OFFSET $7',
].join('\n');

const LINE_COUNT_QUERY = [
  'SELECT COUNT(*)::integer AS "totalItems"',
  LINE_FROM,
  LINE_FILTERS,
].join('\n');

@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: StockMovementsService,
  ) {}

  async list(query: StockCountQueryDto) {
    this.assertSort(query.sort);
    this.assertDateRange(
      query.dateFrom,
      query.dateTo,
    );

    const warehouseId =
      query.warehouseId ?? null;
    const status = query.status
      ? STOCK_COUNT_STATUS_TO_DB[
          query.status
        ]
      : null;
    const dateFrom =
      this.resolveDateFrom(query.dateFrom);
    const dateTo =
      this.resolveDateToExclusive(
        query.dateTo,
      );
    const searchPattern =
      query.search?.trim()
        ? '%' + query.search.trim() + '%'
        : null;
    const sort = query.sort ?? 'createdAt';
    const offset =
      (query.page - 1) * query.pageSize;

    const params = [
      warehouseId,
      status,
      dateFrom,
      dateTo,
      searchPattern,
    ] as const;

    const [rows, countRows] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<
          SummaryRow[]
        >(
          LIST_QUERY,
          ...params,
          sort,
          query.resolvedOrder,
          query.pageSize,
          offset,
        ),
        this.prisma.$queryRawUnsafe<
          CountRow[]
        >(
          COUNT_QUERY,
          ...params,
        ),
      ]);

    return toPaginatedResult(
      rows.map((row) =>
        this.toSummary(row),
      ),
      countRows[0]?.totalItems ?? 0,
      query,
    );
  }

  async get(id: string) {
    const item =
      await this.prisma.stockCount.findUnique({
        where: { id },
        include: {
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
          startedBy: {
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
        },
      });

    if (!item) {
      throw this.notFound();
    }

    const stats =
      await this.lineStats(id);

    return this.toDetail(
      item as StockCountDetailRecord,
      stats,
    );
  }

  async getLines(
    id: string,
    query: StockCountLineQueryDto,
  ) {
    await this.requireCount(id);
    this.assertLineSort(query.sort);

    const searchPattern =
      query.search?.trim()
        ? '%' + query.search.trim() + '%'
        : null;
    const varianceOnly =
      query.varianceOnly === true;
    const sort =
      query.sort ?? 'productName';
    const offset =
      (query.page - 1) * query.pageSize;

    const params = [
      id,
      searchPattern,
      varianceOnly,
    ] as const;

    const [rows, countRows] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<
          LineRow[]
        >(
          LINES_QUERY,
          ...params,
          sort,
          query.resolvedOrder,
          query.pageSize,
          offset,
        ),
        this.prisma.$queryRawUnsafe<
          CountRow[]
        >(
          LINE_COUNT_QUERY,
          ...params,
        ),
      ]);

    return toPaginatedResult(
      rows.map((row) =>
        this.toLine(row),
      ),
      countRows[0]?.totalItems ?? 0,
      query,
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

  async create(
    dto: StockCountCreateDto,
    userId: string,
  ) {
    const warehouse =
      await this.prisma.warehouse.findUnique({
        where: {
          id: dto.warehouseId,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException({
        code:
          'STOCK_COUNT_WAREHOUSE_UNAVAILABLE',
        message:
          'Stock counts require an active warehouse',
        fields: {
          warehouseId: [
            'Select an active warehouse.',
          ],
        },
      });
    }

    const id = await this.prisma.$transaction(
      async (tx) => {
        const sequence =
          await tx.$queryRawUnsafe<
            SequenceRow[]
          >(
            'SELECT nextval(\'stock_count_number_seq\') AS "value"',
          );
        const value = sequence[0]?.value;

        if (value === undefined) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_NUMBER_UNAVAILABLE',
            message:
              'Unable to allocate a stock count number',
          });
        }

        const number =
          'CNT-' +
          value.toString().padStart(8, '0');

        const count =
          await tx.stockCount.create({
            data: {
              number,
              warehouseId:
                dto.warehouseId,
              notes: dto.notes ?? null,
              createdByUserId: userId,
            },
            select: { id: true },
          });

        return count.id;
      },
    );

    return this.get(id);
  }

  async start(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const locked =
          await this.lockWithStatus(
            tx,
            id,
            'DRAFT',
          );

        await this.movements.lockWarehousesInventoryInTransaction(
          tx,
          [locked.warehouseId],
        );

        const active =
          await tx.$queryRawUnsafe<
            Array<{
              id: string;
              number: string;
            }>
          >(
            [
              'SELECT',
              '  "id"::text AS "id",',
              '  "number" AS "number"',
              'FROM "stock_counts"',
              'WHERE "warehouse_id" = $1::uuid',
              '  AND "id" <> $2::uuid',
              '  AND "status" IN (\'COUNTING\', \'SUBMITTED\')',
              'LIMIT 1',
            ].join('\n'),
            locked.warehouseId,
            id,
          );

        if (active[0]) {
          throw new ConflictException({
            code:
              'WAREHOUSE_STOCK_COUNT_ACTIVE',
            message:
              'This warehouse already has an active stock count',
            details: {
              stockCountId:
                active[0].id,
              stockCountNumber:
                active[0].number,
            },
          });
        }

        const warehouse =
          await tx.warehouse.findUnique({
            where: {
              id: locked.warehouseId,
            },
            select: {
              isActive: true,
            },
          });

        if (
          !warehouse ||
          !warehouse.isActive
        ) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_WAREHOUSE_UNAVAILABLE',
            message:
              'The warehouse is inactive and this count cannot be started',
          });
        }

        const reservations =
          await tx.$queryRawUnsafe<
            ExistsRow[]
          >(
            [
              'SELECT EXISTS (',
              '  SELECT 1',
              '  FROM "inventory_items"',
              '  WHERE "warehouse_id" = $1::uuid',
              '    AND "quantity_reserved" <> 0',
              ') AS "exists"',
            ].join('\n'),
            locked.warehouseId,
          );

        if (
          reservations[0]?.exists === true
        ) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_RESERVATIONS_EXIST',
            message:
              'This warehouse has reserved stock. Release or dispatch reservations before starting a physical count',
          });
        }

        const timeRows =
          await tx.$queryRawUnsafe<
            DbTimeRow[]
          >(
            'SELECT clock_timestamp() AS "value"',
          );
        const startedAt =
          timeRows[0]?.value ??
          new Date();

        const snapshot =
          await tx.$queryRawUnsafe<
            SnapshotRow[]
          >(
            [
              'SELECT',
              '  ii."product_id"::text AS "productId",',
              '  ii."quantity_on_hand"::text AS "expectedQuantity",',
              '  ii."average_cost"::text AS "snapshotUnitCost"',
              'FROM "inventory_items" ii',
              'INNER JOIN "products" p ON p."id" = ii."product_id"',
              'WHERE ii."warehouse_id" = $1::uuid',
              '  AND p."is_trackable" = true',
              'ORDER BY ii."product_id" ASC',
            ].join('\n'),
            locked.warehouseId,
          );

        if (snapshot.length === 0) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_EMPTY_WAREHOUSE',
            message:
              'This warehouse has no trackable inventory balances to count',
          });
        }

        await tx.stockCount.update({
          where: { id },
          data: {
            status: 'COUNTING',
            startedAt,
            startedByUserId: userId,
          },
        });

        await tx.stockCountLine.createMany({
          data: snapshot.map(
            (row) => ({
              stockCountId: id,
              productId: row.productId,
              expectedQuantity:
                row.expectedQuantity,
              snapshotUnitCost:
                row.snapshotUnitCost,
            }),
          ),
        });
      },
    );

    return this.get(id);
  }

  async saveLines(
    id: string,
    dto: StockCountLinesUpdateDto,
    query: StockCountLineQueryDto,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'COUNTING',
        );

        const duplicate =
          this.findDuplicateLineId(
            dto.lines,
          );

        if (duplicate) {
          throw new BadRequestException({
            code:
              'STOCK_COUNT_DUPLICATE_LINE',
            message:
              'A stock-count line can appear only once in a save request',
            fields: {
              lines: [
                'Remove duplicate line updates.',
              ],
            },
            details: {
              lineId: duplicate,
            },
          });
        }

        const ids = dto.lines.map(
          (line) => line.lineId,
        );
        const existing =
          await tx.stockCountLine.findMany({
            where: {
              stockCountId: id,
              id: { in: ids },
            },
            select: {
              id: true,
              expectedQuantity: true,
            },
          });

        if (
          existing.length !==
          ids.length
        ) {
          throw new BadRequestException({
            code:
              'STOCK_COUNT_LINE_NOT_FOUND',
            message:
              'One or more lines do not belong to this stock count',
            fields: {
              lines: [
                'Reload the count and try again.',
              ],
            },
          });
        }

        for (const line of dto.lines) {
          const quantity =
            line.countedQuantity.toFixed(4);

          const updated =
            await tx.$executeRawUnsafe(
              [
                'UPDATE "stock_count_lines"',
                'SET',
                '  "counted_quantity" = $2::numeric(19,4),',
                '  "variance_quantity" = $2::numeric(19,4) - "expected_quantity"',
                'WHERE "id" = $1::uuid',
                '  AND "stock_count_id" = $3::uuid',
              ].join('\n'),
              line.lineId,
              quantity,
              id,
            );

          if (updated !== 1) {
            throw new ConflictException({
              code:
                'STOCK_COUNT_LINE_CHANGED',
              message:
                'A stock-count line changed before it could be saved',
              details: {
                lineId: line.lineId,
              },
            });
          }
        }
      },
    );

    return this.getLines(id, query);
  }

  async submit(id: string, userId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockWithStatus(
          tx,
          id,
          'COUNTING',
        );

        const stats =
          await this.lineStatsInTransaction(
            tx,
            id,
          );

        if (stats.lineCount === 0) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_LINES_REQUIRED',
            message:
              'A stock count requires at least one line',
          });
        }

        if (
          stats.countedLineCount !==
          stats.lineCount
        ) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_INCOMPLETE',
            message:
              'Every stock-count line must be counted before submission',
            details: {
              lineCount: stats.lineCount,
              countedLineCount:
                stats.countedLineCount,
            },
          });
        }

        await tx.stockCount.update({
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

  async approveAndPost(
    id: string,
    userId: string,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const locked =
          await this.lockWithStatus(
            tx,
            id,
            'SUBMITTED',
          );

        if (!locked.startedAt) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_SNAPSHOT_MISSING',
            message:
              'The stock-count snapshot timestamp is missing',
          });
        }

        await this.movements.lockWarehousesInventoryInTransaction(
          tx,
          [locked.warehouseId],
        );

        const warehouse =
          await tx.warehouse.findUnique({
            where: {
              id: locked.warehouseId,
            },
            select: {
              isActive: true,
            },
          });

        if (
          !warehouse ||
          !warehouse.isActive
        ) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_WAREHOUSE_UNAVAILABLE',
            message:
              'The warehouse is inactive and this count cannot be posted',
          });
        }

        const reservations =
          await tx.$queryRawUnsafe<
            ExistsRow[]
          >(
            [
              'SELECT EXISTS (',
              '  SELECT 1',
              '  FROM "inventory_items"',
              '  WHERE "warehouse_id" = $1::uuid',
              '    AND "quantity_reserved" <> 0',
              ') AS "exists"',
            ].join('\n'),
            locked.warehouseId,
          );

        if (
          reservations[0]?.exists === true
        ) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_RESERVATIONS_EXIST',
            message:
              'Reserved stock appeared during this count. The count cannot be safely posted',
          });
        }

        const intervening =
          await tx.$queryRawUnsafe<
            ExistsRow[]
          >(
            [
              'SELECT EXISTS (',
              '  SELECT 1',
              '  FROM "stock_movements"',
              '  WHERE "warehouse_id" = $1::uuid',
              '    AND "created_at" > $2::timestamptz',
              '    AND NOT (',
              '      "type" = \'STOCK_COUNT\'',
              '      AND "reference_type" = \'stock-count\'',
              '      AND "reference_id" = $3::text',
              '    )',
              ') AS "exists"',
            ].join('\n'),
            locked.warehouseId,
            locked.startedAt,
            id,
          );

        if (
          intervening[0]?.exists === true
        ) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_INTERVENING_MOVEMENT',
            message:
              'Inventory activity occurred after the count snapshot. This count cannot be safely posted',
          });
        }

        const lines =
          await tx.$queryRawUnsafe<
            PostLineRow[]
          >(
            [
              'SELECT',
              '  scl."id"::text AS "id",',
              '  scl."product_id"::text AS "productId",',
              '  scl."expected_quantity"::text AS "expectedQuantity",',
              '  scl."counted_quantity"::text AS "countedQuantity",',
              '  scl."variance_quantity"::text AS "varianceQuantity",',
              '  scl."snapshot_unit_cost"::text AS "snapshotUnitCost",',
              '  scl."movement_id"::text AS "movementId",',
              '  ii."quantity_on_hand"::text AS "currentQuantity"',
              'FROM "stock_count_lines" scl',
              'LEFT JOIN "inventory_items" ii',
              '  ON ii."product_id" = scl."product_id"',
              ' AND ii."warehouse_id" = $2::uuid',
              'WHERE scl."stock_count_id" = $1::uuid',
              'ORDER BY scl."product_id" ASC',
            ].join('\n'),
            id,
            locked.warehouseId,
          );

        if (lines.length === 0) {
          throw new ConflictException({
            code:
              'STOCK_COUNT_LINES_REQUIRED',
            message:
              'A stock count requires at least one line',
          });
        }

        for (const line of lines) {
          if (
            line.countedQuantity === null ||
            line.varianceQuantity === null
          ) {
            throw new ConflictException({
              code:
                'STOCK_COUNT_INCOMPLETE',
              message:
                'Every stock-count line must be counted before posting',
              details: {
                lineId: line.id,
              },
            });
          }

          if (line.movementId !== null) {
            throw new ConflictException({
              code:
                'STOCK_COUNT_LINE_ALREADY_POSTED',
              message:
                'A stock-count line already has a posting movement',
              details: {
                lineId: line.id,
              },
            });
          }

          if (
            line.currentQuantity === null ||
            this.parseScaled4(
              line.currentQuantity,
            ) !==
              this.parseScaled4(
                line.expectedQuantity,
              )
          ) {
            throw new ConflictException({
              code:
                'STOCK_COUNT_SNAPSHOT_CHANGED',
              message:
                'Current inventory no longer matches the captured stock-count snapshot',
              details: {
                productId:
                  line.productId,
                expectedQuantity:
                  Number(
                    line.expectedQuantity,
                  ),
                currentQuantity:
                  line.currentQuantity ===
                  null
                    ? null
                    : Number(
                        line.currentQuantity,
                      ),
              },
            });
          }
        }

        const occurredAt = new Date();

        for (const line of lines) {
          const variance =
            Number(
              line.varianceQuantity!,
            );

          if (variance === 0) {
            continue;
          }

          const movement =
            await this.movements.applyMovementInTransaction(
              tx,
              {
                productId: line.productId,
                warehouseId:
                  locked.warehouseId,
                type: 'stock-count',
                quantityChange: variance,
                unitCost: Number(
                  line.snapshotUnitCost,
                ),
                reference: {
                  type: 'stock-count',
                  id,
                  number: locked.number,
                  referencePath:
                    '/stock-counts/' + id,
                },
                performedByUserId:
                  userId,
                occurredAt,
              },
            );

          const updated =
            await tx.stockCountLine.updateMany({
              where: {
                id: line.id,
                stockCountId: id,
                movementId: null,
              },
              data: {
                movementId: movement.id,
                balanceBefore:
                  movement.balanceBefore,
                balanceAfter:
                  movement.balanceAfter,
              },
            });

          if (updated.count !== 1) {
            throw new ConflictException({
              code:
                'STOCK_COUNT_LINE_CHANGED',
              message:
                'A stock-count line changed before its movement could be linked',
              details: {
                lineId: line.id,
              },
            });
          }
        }

        await tx.stockCount.update({
          where: { id },
          data: {
            status: 'POSTED',
            approvedAt: occurredAt,
            approvedByUserId: userId,
            postedAt: occurredAt,
          },
        });
      },
    );

    return this.get(id);
  }

  private async lineStats(
    id: string,
  ): Promise<LineStatsRow> {
    const rows =
      await this.prisma.$queryRawUnsafe<
        LineStatsRow[]
      >(
        this.lineStatsQuery(),
        id,
      );

    return this.resolveLineStats(rows);
  }

  private async lineStatsInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<LineStatsRow> {
    const rows =
      await tx.$queryRawUnsafe<
        LineStatsRow[]
      >(
        this.lineStatsQuery(),
        id,
      );

    return this.resolveLineStats(rows);
  }

  private lineStatsQuery(): string {
    return [
      'SELECT',
      '  COUNT(*)::integer AS "lineCount",',
      '  COUNT(*) FILTER (WHERE "counted_quantity" IS NOT NULL)::integer AS "countedLineCount",',
      '  COUNT(*) FILTER (WHERE "variance_quantity" IS NOT NULL AND "variance_quantity" <> 0)::integer AS "varianceLineCount"',
      'FROM "stock_count_lines"',
      'WHERE "stock_count_id" = $1::uuid',
    ].join('\n');
  }

  private resolveLineStats(
    rows: LineStatsRow[],
  ): LineStatsRow {
    return (
      rows[0] ?? {
        lineCount: 0,
        countedLineCount: 0,
        varianceLineCount: 0,
      }
    );
  }

  private async requireCount(id: string) {
    const item =
      await this.prisma.stockCount.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!item) {
      throw this.notFound();
    }

    return item;
  }

  private async lockWithStatus(
    tx: Prisma.TransactionClient,
    id: string,
    requiredStatus:
      | 'DRAFT'
      | 'COUNTING'
      | 'SUBMITTED',
  ): Promise<LockedCountRow> {
    const rows =
      await tx.$queryRawUnsafe<
        LockedCountRow[]
      >(
        [
          'SELECT',
          '  "status"::text AS "status",',
          '  "warehouse_id"::text AS "warehouseId",',
          '  "number" AS "number",',
          '  "started_at" AS "startedAt"',
          'FROM "stock_counts"',
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
          'STOCK_COUNT_INVALID_STATUS',
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

    return row;
  }

  private findDuplicateLineId(
    lines: ReadonlyArray<{
      lineId: string;
    }>,
  ): string | undefined {
    const seen = new Set<string>();

    for (const line of lines) {
      if (seen.has(line.lineId)) {
        return line.lineId;
      }
      seen.add(line.lineId);
    }

    return undefined;
  }

  private toSummary(row: SummaryRow) {
    return {
      id: row.id,
      number: row.number,
      warehouseId: row.warehouseId,
      warehouseCode:
        row.warehouseCode,
      warehouseName:
        row.warehouseName,
      status:
        STOCK_COUNT_STATUS_FROM_DB[
          row.status
        ],
      lineCount: row.lineCount,
      countedLineCount:
        row.countedLineCount,
      varianceLineCount:
        row.varianceLineCount,
      createdAt: row.createdAt,
      ...(row.startedAt
        ? { startedAt: row.startedAt }
        : {}),
      ...(row.submittedAt
        ? {
            submittedAt:
              row.submittedAt,
          }
        : {}),
      ...(row.postedAt
        ? { postedAt: row.postedAt }
        : {}),
    };
  }

  private toDetail(
    item: StockCountDetailRecord,
    stats: LineStatsRow,
  ) {
    return {
      id: item.id,
      number: item.number,
      warehouseId: item.warehouseId,
      warehouseCode:
        item.warehouse.code,
      warehouseName:
        item.warehouse.name,
      status:
        STOCK_COUNT_STATUS_FROM_DB[
          item.status
        ],
      lineCount: stats.lineCount,
      countedLineCount:
        stats.countedLineCount,
      varianceLineCount:
        stats.varianceLineCount,
      createdAt: item.createdAt,
      ...(item.startedAt
        ? { startedAt: item.startedAt }
        : {}),
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
      ...(item.postedAt
        ? { postedAt: item.postedAt }
        : {}),
      ...(item.notes
        ? { notes: item.notes }
        : {}),
      createdBy: this.actor(
        item.createdBy,
      ),
      ...(item.startedBy
        ? {
            startedBy:
              this.actor(
                item.startedBy,
              ),
          }
        : {}),
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

  private toLine(row: LineRow) {
    return {
      id: row.id,
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      ...(row.unitSymbol
        ? {
            unitSymbol:
              row.unitSymbol,
          }
        : {}),
      expectedQuantity: Number(
        row.expectedQuantity,
      ),
      countedQuantity:
        row.countedQuantity === null
          ? null
          : Number(
              row.countedQuantity,
            ),
      varianceQuantity:
        row.varianceQuantity === null
          ? null
          : Number(
              row.varianceQuantity,
            ),
      ...(row.movementId
        ? {
            movement: {
              id: row.movementId,
              ...(row.movementNumber
                ? {
                    number:
                      row.movementNumber,
                  }
                : {}),
            },
          }
        : {}),
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

  private statusMessage(
    status:
      | 'DRAFT'
      | 'COUNTING'
      | 'SUBMITTED',
  ): string {
    switch (status) {
      case 'DRAFT':
        return 'Only draft stock counts can be started';
      case 'COUNTING':
        return 'Only counting stock counts can be edited or submitted';
      case 'SUBMITTED':
        return 'Only submitted stock counts can be approved and posted';
    }
  }

  private assertSort(
    sort: string | undefined,
  ): void {
    const allowed = new Set([
      'createdAt',
      'number',
      'warehouseName',
      'status',
      'startedAt',
      'postedAt',
    ]);

    if (
      sort !== undefined &&
      !allowed.has(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for stock counts',
        statusCode:
          HttpStatus.BAD_REQUEST,
        details: { sort },
      });
    }
  }

  private assertLineSort(
    sort: string | undefined,
  ): void {
    const allowed = new Set([
      'productName',
      'sku',
      'expectedQuantity',
      'countedQuantity',
      'varianceQuantity',
    ]);

    if (
      sort !== undefined &&
      !allowed.has(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for stock-count lines',
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

    const from =
      this.resolveDateFrom(dateFrom);
    const to =
      this.resolveDateToExclusive(
        dateTo,
      );

    if (
      from &&
      to &&
      from >= to
    ) {
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

    const date = new Date(value);
    return new Date(
      date.getTime() + 1,
    );
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

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'STOCK_COUNT_NOT_FOUND',
      message:
        'Stock count was not found',
    });
  }
}
