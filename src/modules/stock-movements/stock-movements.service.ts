import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ApiException } from '../../common/exceptions/api.exception.js';
import { toPaginatedResult } from '../../common/utils/pagination.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto.js';
import {
  type ApplyStockMovementInput,
  STOCK_MOVEMENT_API_TYPE,
  STOCK_MOVEMENT_DB_TYPE,
  type StockMovementType,
} from './stock-movement.types.js';

interface MovementRow {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unitSymbol: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  dbType: keyof typeof STOCK_MOVEMENT_API_TYPE;
  quantityChange: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  referencePath: string | null;
  occurredAt: Date;
  performedByUserId: string | null;
  performedByName: string | null;
  notes?: string | null;
  createdAt?: Date;
}

interface CountRow {
  totalItems: number;
}

interface InventoryLockRow {
  quantityOnHand: string;
  quantityReserved: string;
  averageCost: string;
}

interface UpdatedInventoryRow {
  quantityOnHand: string;
  quantityReserved: string;
  averageCost: string;
}

interface MovementContextRow {
  sku: string;
  productName: string;
  unitSymbol: string | null;
  warehouseCode: string;
  warehouseName: string;
}

interface ActorRow {
  name: string;
}

const MOVEMENT_SELECT = [
  'SELECT',
  '  m."id"::text AS "id",',
  '  p."id"::text AS "productId",',
  '  p."sku" AS "sku",',
  '  p."name" AS "productName",',
  '  u."symbol" AS "unitSymbol",',
  '  w."id"::text AS "warehouseId",',
  '  w."code" AS "warehouseCode",',
  '  w."name" AS "warehouseName",',
  '  m."type"::text AS "dbType",',
  '  m."quantity_change"::text AS "quantityChange",',
  '  m."balance_after"::text AS "balanceAfter",',
  '  m."reference_type" AS "referenceType",',
  '  m."reference_id" AS "referenceId",',
  '  m."reference_number" AS "referenceNumber",',
  '  m."reference_path" AS "referencePath",',
  '  m."occurred_at" AS "occurredAt",',
  '  m."performed_by_user_id"::text AS "performedByUserId",',
  '  CASE',
  '    WHEN actor."id" IS NULL THEN NULL',
  '    ELSE TRIM(actor."first_name" || \' \' || actor."last_name")',
  '  END AS "performedByName"',
].join('\n');

const MOVEMENT_JOINS = [
  'FROM "stock_movements" m',
  'INNER JOIN "products" p ON p."id" = m."product_id"',
  'INNER JOIN "warehouses" w ON w."id" = m."warehouse_id"',
  'LEFT JOIN "units" u ON u."id" = p."unit_id"',
  'LEFT JOIN "users" actor ON actor."id" = m."performed_by_user_id"',
].join('\n');

const MOVEMENT_FILTERS = [
  'WHERE ($1::uuid IS NULL OR m."product_id" = $1::uuid)',
  '  AND ($2::uuid IS NULL OR m."warehouse_id" = $2::uuid)',
  '  AND ($3::"StockMovementType" IS NULL OR m."type" = $3::"StockMovementType")',
  '  AND ($4::timestamptz IS NULL OR m."occurred_at" >= $4::timestamptz)',
  '  AND ($5::timestamptz IS NULL OR m."occurred_at" < $5::timestamptz)',
  '  AND (',
  '    $6::text IS NULL',
  '    OR m."reference_type" ILIKE $6',
  '    OR m."reference_id" ILIKE $6',
  '    OR m."reference_number" ILIKE $6',
  '  )',
  '  AND (',
  '    $7::text IS NULL',
  '    OR p."sku" ILIKE $7',
  '    OR p."name" ILIKE $7',
  '    OR w."code" ILIKE $7',
  '    OR w."name" ILIKE $7',
  '  )',
].join('\n');

const MOVEMENT_LIST_QUERY = [
  MOVEMENT_SELECT + ',',
  '  m."created_at" AS "createdAt"',
  MOVEMENT_JOINS,
  MOVEMENT_FILTERS,
  'ORDER BY',
  '  CASE WHEN $8::text = \'occurredAt\' AND $9::text = \'asc\' THEN m."occurred_at" END ASC,',
  '  CASE WHEN $8::text = \'occurredAt\' AND $9::text = \'desc\' THEN m."occurred_at" END DESC,',
  '  CASE WHEN $8::text = \'productName\' AND $9::text = \'asc\' THEN p."name" END ASC,',
  '  CASE WHEN $8::text = \'productName\' AND $9::text = \'desc\' THEN p."name" END DESC,',
  '  CASE WHEN $8::text = \'sku\' AND $9::text = \'asc\' THEN p."sku" END ASC,',
  '  CASE WHEN $8::text = \'sku\' AND $9::text = \'desc\' THEN p."sku" END DESC,',
  '  CASE WHEN $8::text = \'warehouseName\' AND $9::text = \'asc\' THEN w."name" END ASC,',
  '  CASE WHEN $8::text = \'warehouseName\' AND $9::text = \'desc\' THEN w."name" END DESC,',
  '  CASE WHEN $8::text = \'type\' AND $9::text = \'asc\' THEN m."type"::text END ASC,',
  '  CASE WHEN $8::text = \'type\' AND $9::text = \'desc\' THEN m."type"::text END DESC,',
  '  CASE WHEN $8::text = \'quantityChange\' AND $9::text = \'asc\' THEN m."quantity_change" END ASC,',
  '  CASE WHEN $8::text = \'quantityChange\' AND $9::text = \'desc\' THEN m."quantity_change" END DESC,',
  '  CASE WHEN $8::text = \'balanceAfter\' AND $9::text = \'asc\' THEN m."balance_after" END ASC,',
  '  CASE WHEN $8::text = \'balanceAfter\' AND $9::text = \'desc\' THEN m."balance_after" END DESC,',
  '  m."id" ASC',
  'LIMIT $10 OFFSET $11',
].join('\n');

const MOVEMENT_COUNT_QUERY = [
  'SELECT COUNT(*)::integer AS "totalItems"',
  MOVEMENT_JOINS,
  MOVEMENT_FILTERS,
].join('\n');

const MOVEMENT_DETAIL_QUERY = [
  MOVEMENT_SELECT + ',',
  '  m."notes" AS "notes",',
  '  m."created_at" AS "createdAt"',
  MOVEMENT_JOINS,
  'WHERE m."id" = $1::uuid',
  'LIMIT 1',
].join('\n');

const CONTEXT_QUERY = [
  'SELECT',
  '  p."sku" AS "sku",',
  '  p."name" AS "productName",',
  '  u."symbol" AS "unitSymbol",',
  '  w."code" AS "warehouseCode",',
  '  w."name" AS "warehouseName"',
  'FROM "products" p',
  'CROSS JOIN "warehouses" w',
  'LEFT JOIN "units" u ON u."id" = p."unit_id"',
  'WHERE p."id" = $1::uuid',
  '  AND w."id" = $2::uuid',
  'LIMIT 1',
].join('\n');

const ENSURE_BALANCE_QUERY = [
  'INSERT INTO "inventory_items" (',
  '  "id", "product_id", "warehouse_id",',
  '  "quantity_on_hand", "quantity_reserved", "average_cost",',
  '  "created_at", "updated_at"',
  ') VALUES (',
  '  $1::uuid, $2::uuid, $3::uuid,',
  '  0, 0, 0, NOW(), NOW()',
  ')',
  'ON CONFLICT ("product_id", "warehouse_id") DO NOTHING',
].join('\n');

const LOCK_BALANCE_QUERY = [
  'SELECT',
  '  "quantity_on_hand"::text AS "quantityOnHand",',
  '  "quantity_reserved"::text AS "quantityReserved",',
  '  "average_cost"::text AS "averageCost"',
  'FROM "inventory_items"',
  'WHERE "product_id" = $1::uuid',
  '  AND "warehouse_id" = $2::uuid',
  'FOR UPDATE',
].join('\n');

const UPDATE_BALANCE_QUERY = [
  'UPDATE "inventory_items"',
  'SET',
  '  "quantity_on_hand" = "quantity_on_hand" + $3::numeric(19,4),',
  '  "average_cost" = CASE',
  '    WHEN $3::numeric(19,4) > 0',
  '      AND $4::numeric(19,4) IS NOT NULL',
  '      AND ("quantity_on_hand" + $3::numeric(19,4)) > 0',
  '    THEN ROUND(',
  '      (',
  '        ("quantity_on_hand" * "average_cost") +',
  '        ($3::numeric(19,4) * $4::numeric(19,4))',
  '      ) / ("quantity_on_hand" + $3::numeric(19,4)),',
  '      4',
  '    )',
  '    ELSE "average_cost"',
  '  END,',
  '  "updated_at" = NOW()',
  'WHERE "product_id" = $1::uuid',
  '  AND "warehouse_id" = $2::uuid',
  '  AND (',
  '    $5::boolean',
  '    OR (',
  '      "quantity_on_hand" + $3::numeric(19,4) - "quantity_reserved"',
  '    ) >= 0',
  '  )',
  'RETURNING',
  '  "quantity_on_hand"::text AS "quantityOnHand",',
  '  "quantity_reserved"::text AS "quantityReserved",',
  '  "average_cost"::text AS "averageCost"',
].join('\n');

const INSERT_MOVEMENT_QUERY = [
  'INSERT INTO "stock_movements" (',
  '  "id", "product_id", "warehouse_id", "type",',
  '  "quantity_change", "unit_cost",',
  '  "balance_before", "balance_after",',
  '  "reference_type", "reference_id", "reference_number", "reference_path",',
  '  "notes", "occurred_at", "performed_by_user_id", "created_at"',
  ') VALUES (',
  '  $1::uuid, $2::uuid, $3::uuid, $4::"StockMovementType",',
  '  $5::numeric(19,4), $6::numeric(19,4),',
  '  $7::numeric(19,4), $8::numeric(19,4),',
  '  $9::text, $10::text, $11::text, $12::text,',
  '  $13::text, $14::timestamptz, $15::uuid, NOW()',
  ')',
].join('\n');

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: StockMovementQueryDto) {
    this.assertSort(query.sort);
    this.assertDateRange(query.dateFrom, query.dateTo);

    const productId = query.productId ?? null;
    const warehouseId = query.warehouseId ?? null;
    const dbType = query.type
      ? STOCK_MOVEMENT_DB_TYPE[query.type]
      : null;
    const dateFrom = this.resolveDateFrom(query.dateFrom);
    const dateTo = this.resolveDateToExclusive(query.dateTo);
    const referencePattern = query.reference?.trim()
      ? '%' + query.reference.trim() + '%'
      : null;
    const searchPattern = query.search?.trim()
      ? '%' + query.search.trim() + '%'
      : null;
    const sort = query.sort ?? 'occurredAt';
    const offset = (query.page - 1) * query.pageSize;

    const params = [
      productId,
      warehouseId,
      dbType,
      dateFrom,
      dateTo,
      referencePattern,
      searchPattern,
    ] as const;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<MovementRow[]>(
        MOVEMENT_LIST_QUERY,
        ...params,
        sort,
        query.resolvedOrder,
        query.pageSize,
        offset,
      ),
      this.prisma.$queryRawUnsafe<CountRow[]>(
        MOVEMENT_COUNT_QUERY,
        ...params,
      ),
    ]);

    return toPaginatedResult(
      rows.map((row) => this.toSummary(row)),
      countRows[0]?.totalItems ?? 0,
      query,
    );
  }

  async get(id: string) {
    const rows =
      await this.prisma.$queryRawUnsafe<MovementRow[]>(
        MOVEMENT_DETAIL_QUERY,
        id,
      );

    const movement = rows[0];

    if (!movement) {
      throw new NotFoundException({
        code: 'STOCK_MOVEMENT_NOT_FOUND',
        message: 'Stock movement was not found',
      });
    }

    return {
      ...this.toSummary(movement),
      ...(movement.notes
        ? { notes: movement.notes }
        : {}),
      createdAt: movement.createdAt,
    };
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

    return { warehouses };
  }

  async applyMovement(input: ApplyStockMovementInput) {
    this.validateCommand(input);

    const quantityChange = this.decimalArgument(
      input.quantityChange,
    );
    const unitCost =
      input.unitCost === undefined
        ? null
        : this.decimalArgument(input.unitCost);
    const occurredAt = input.occurredAt ?? new Date();
    const dbType = STOCK_MOVEMENT_DB_TYPE[input.type];

    return this.prisma.$transaction(async (tx) => {
      const contextRows =
        await tx.$queryRawUnsafe<MovementContextRow[]>(
          CONTEXT_QUERY,
          input.productId,
          input.warehouseId,
        );

      const context = contextRows[0];

      if (!context) {
        await this.assertMovementEntities(
          input.productId,
          input.warehouseId,
        );
        throw new BadRequestException({
          code: 'INVALID_STOCK_MOVEMENT_CONTEXT',
          message:
            'The product or warehouse is unavailable for this stock movement',
        });
      }

      let actorName: string | undefined;

      if (input.performedByUserId) {
        const actorRows =
          await tx.$queryRawUnsafe<ActorRow[]>(
            [
              'SELECT TRIM("first_name" || \' \' || "last_name") AS "name"',
              'FROM "users"',
              'WHERE "id" = $1::uuid',
              'LIMIT 1',
            ].join('\n'),
            input.performedByUserId,
          );

        actorName = actorRows[0]?.name;

        if (!actorName) {
          throw new BadRequestException({
            code: 'INVALID_MOVEMENT_ACTOR',
            message:
              'The stock movement actor does not exist',
          });
        }
      }

      await tx.$executeRawUnsafe(
        ENSURE_BALANCE_QUERY,
        randomUUID(),
        input.productId,
        input.warehouseId,
      );

      const lockedRows =
        await tx.$queryRawUnsafe<InventoryLockRow[]>(
          LOCK_BALANCE_QUERY,
          input.productId,
          input.warehouseId,
        );

      const locked = lockedRows[0];

      if (!locked) {
        throw new ConflictException({
          code: 'INVENTORY_BALANCE_UNAVAILABLE',
          message:
            'Inventory balance could not be locked for update',
        });
      }

      const setting =
        await tx.systemSetting.findUnique({
          where: {
            key: 'inventory.allowNegativeStock',
          },
          select: { value: true },
        });
      const allowNegativeStock =
        setting?.value === true;

      const updatedRows =
        await tx.$queryRawUnsafe<UpdatedInventoryRow[]>(
          UPDATE_BALANCE_QUERY,
          input.productId,
          input.warehouseId,
          quantityChange,
          unitCost,
          allowNegativeStock,
        );

      const updated = updatedRows[0];

      if (!updated) {
        throw new ConflictException({
          code: 'INSUFFICIENT_AVAILABLE_STOCK',
          message:
            'This movement would reduce available stock below zero',
          details: {
            productId: input.productId,
            warehouseId: input.warehouseId,
          },
        });
      }

      const movementId = randomUUID();

      await tx.$executeRawUnsafe(
        INSERT_MOVEMENT_QUERY,
        movementId,
        input.productId,
        input.warehouseId,
        dbType,
        quantityChange,
        unitCost,
        locked.quantityOnHand,
        updated.quantityOnHand,
        input.reference?.type ?? null,
        input.reference?.id ?? null,
        input.reference?.number ?? null,
        input.reference?.referencePath ?? null,
        input.notes?.trim() || null,
        occurredAt,
        input.performedByUserId ?? null,
      );

      return {
        id: movementId,
        productId: input.productId,
        sku: context.sku,
        productName: context.productName,
        ...(context.unitSymbol
          ? { unitSymbol: context.unitSymbol }
          : {}),
        warehouseId: input.warehouseId,
        warehouseCode: context.warehouseCode,
        warehouseName: context.warehouseName,
        type: input.type,
        quantityChange: input.quantityChange,
        balanceAfter: Number(updated.quantityOnHand),
        ...(input.reference
          ? { reference: input.reference }
          : {}),
        occurredAt,
        ...(actorName
          ? {
              performedBy: {
                id: input.performedByUserId,
                name: actorName,
              },
            }
          : {}),
        ...(input.notes?.trim()
          ? { notes: input.notes.trim() }
          : {}),
        createdAt: new Date(),
      };
    });
  }

  private async assertMovementEntities(
    productId: string,
    warehouseId: string,
  ): Promise<void> {
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true },
      }),
    ]);

    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product was not found',
      });
    }

    if (!warehouse) {
      throw new NotFoundException({
        code: 'WAREHOUSE_NOT_FOUND',
        message: 'Warehouse was not found',
      });
    }
  }

  private validateCommand(
    input: ApplyStockMovementInput,
  ): void {
    this.assertDecimal(
      input.quantityChange,
      'quantityChange',
      true,
    );

    if (input.unitCost !== undefined) {
      this.assertDecimal(
        input.unitCost,
        'unitCost',
        false,
      );
    }

    if (
      input.occurredAt &&
      (!Number.isFinite(input.occurredAt.getTime()))
    ) {
      throw new BadRequestException({
        code: 'INVALID_MOVEMENT_DATE',
        message:
          'Stock movement occurredAt must be a valid date',
      });
    }

    if (
      input.reference?.referencePath &&
      (!input.reference.referencePath.startsWith('/') ||
        input.reference.referencePath.startsWith('//'))
    ) {
      throw new BadRequestException({
        code: 'INVALID_REFERENCE_PATH',
        message:
          'Stock movement referencePath must be a safe local path',
      });
    }

    if (input.quantityChange === 0) {
      return;
    }

    const positiveTypes = new Set<StockMovementType>([
      'receipt',
      'transfer-in',
      'adjustment-in',
      'return-in',
    ]);
    const negativeTypes = new Set<StockMovementType>([
      'sale',
      'transfer-out',
      'adjustment-out',
      'return-out',
    ]);

    if (
      positiveTypes.has(input.type) &&
      input.quantityChange < 0
    ) {
      throw this.signException(input.type);
    }

    if (
      negativeTypes.has(input.type) &&
      input.quantityChange > 0
    ) {
      throw this.signException(input.type);
    }
  }

  private signException(
    type: StockMovementType,
  ): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_MOVEMENT_SIGN',
      message:
        'Quantity direction does not match stock movement type',
      details: { type },
    });
  }

  private assertDecimal(
    value: number,
    field: string,
    allowNegative: boolean,
  ): void {
    if (
      !Number.isFinite(value) ||
      (!allowNegative && value < 0)
    ) {
      throw new BadRequestException({
        code: 'INVALID_MOVEMENT_QUANTITY',
        message: field + ' must be a valid numeric value',
        details: { field },
      });
    }

    const scaled = value * 10000;

    if (
      Math.abs(scaled - Math.round(scaled)) >
      0.000001
    ) {
      throw new BadRequestException({
        code: 'INVALID_DECIMAL_SCALE',
        message:
          field + ' supports at most four decimal places',
        details: { field },
      });
    }
  }

  private decimalArgument(value: number): string {
    return value.toFixed(4);
  }

  private assertSort(sort: string | undefined): void {
    const allowed = new Set([
      'occurredAt',
      'productName',
      'sku',
      'warehouseName',
      'type',
      'quantityChange',
      'balanceAfter',
    ]);

    if (
      sort !== undefined &&
      !allowed.has(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for stock movements',
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

    const date = new Date(value);
    return new Date(date.getTime() + 1);
  }

  private toSummary(row: MovementRow) {
    const type = STOCK_MOVEMENT_API_TYPE[row.dbType];

    return {
      id: row.id,
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      ...(row.unitSymbol
        ? { unitSymbol: row.unitSymbol }
        : {}),
      warehouseId: row.warehouseId,
      warehouseCode: row.warehouseCode,
      warehouseName: row.warehouseName,
      type,
      quantityChange: Number(
        row.quantityChange,
      ),
      balanceAfter: Number(row.balanceAfter),
      ...(row.referenceType &&
      row.referenceId &&
      row.referenceNumber
        ? {
            reference: {
              type: row.referenceType,
              id: row.referenceId,
              number: row.referenceNumber,
              ...(row.referencePath
                ? {
                    referencePath:
                      row.referencePath,
                  }
                : {}),
            },
          }
        : {}),
      occurredAt: row.occurredAt,
      ...(row.performedByName
        ? {
            performedBy: {
              ...(row.performedByUserId
                ? {
                    id:
                      row.performedByUserId,
                  }
                : {}),
              name: row.performedByName,
            },
          }
        : {}),
    };
  }
}
