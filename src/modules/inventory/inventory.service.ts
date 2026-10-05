import {
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ApiException } from '../../common/exceptions/api.exception.js';
import { toPaginatedResult } from '../../common/utils/pagination.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type InventoryStockStatus,
  InventoryBalanceQueryDto,
} from './dto/inventory-balance-query.dto.js';

interface InventoryBalanceRow {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unitName: string | null;
  unitSymbol: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  reorderLevel: string;
  status: InventoryStockStatus;
  updatedAt: Date;
}

interface InventoryCountRow {
  totalItems: number;
}

interface InventoryTotalsRow {
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  lowStockLines: number;
  outOfStockLines: number;
}

interface BalanceQueryInput {
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  direction: 'asc' | 'desc';
  productId?: string;
  warehouseId?: string;
  status?: InventoryStockStatus;
}

const BALANCE_QUERY = [
  'SELECT',
  '  i."id"::text AS "id",',
  '  p."id"::text AS "productId",',
  '  p."sku" AS "sku",',
  '  p."name" AS "productName",',
  '  u."name" AS "unitName",',
  '  u."symbol" AS "unitSymbol",',
  '  w."id"::text AS "warehouseId",',
  '  w."code" AS "warehouseCode",',
  '  w."name" AS "warehouseName",',
  '  i."quantity_on_hand"::text AS "quantityOnHand",',
  '  i."quantity_reserved"::text AS "quantityReserved",',
  '  (i."quantity_on_hand" - i."quantity_reserved")::text AS "quantityAvailable",',
  '  p."reorder_point"::text AS "reorderLevel",',
  '  CASE',
  '    WHEN (i."quantity_on_hand" - i."quantity_reserved") <= 0 THEN \'out-of-stock\'',
  '    WHEN (i."quantity_on_hand" - i."quantity_reserved") <= p."reorder_point" THEN \'low-stock\'',
  '    ELSE \'in-stock\'',
  '  END AS "status",',
  '  i."updated_at" AS "updatedAt"',
  'FROM "inventory_items" i',
  'INNER JOIN "products" p ON p."id" = i."product_id"',
  'INNER JOIN "warehouses" w ON w."id" = i."warehouse_id"',
  'LEFT JOIN "units" u ON u."id" = p."unit_id"',
  'WHERE ($1::uuid IS NULL OR i."product_id" = $1::uuid)',
  '  AND ($2::uuid IS NULL OR i."warehouse_id" = $2::uuid)',
  '  AND (',
  '    $3::text IS NULL',
  '    OR p."sku" ILIKE $3',
  '    OR p."name" ILIKE $3',
  '    OR COALESCE(p."barcode", \'\') ILIKE $3',
  '    OR w."code" ILIKE $3',
  '    OR w."name" ILIKE $3',
  '  )',
  '  AND (',
  '    $4::text IS NULL',
  '    OR CASE',
  '      WHEN (i."quantity_on_hand" - i."quantity_reserved") <= 0 THEN \'out-of-stock\'',
  '      WHEN (i."quantity_on_hand" - i."quantity_reserved") <= p."reorder_point" THEN \'low-stock\'',
  '      ELSE \'in-stock\'',
  '    END = $4::text',
  '  )',
  'ORDER BY',
  '  CASE WHEN $5::text = \'productName\' AND $6::text = \'asc\' THEN p."name" END ASC,',
  '  CASE WHEN $5::text = \'productName\' AND $6::text = \'desc\' THEN p."name" END DESC,',
  '  CASE WHEN $5::text = \'sku\' AND $6::text = \'asc\' THEN p."sku" END ASC,',
  '  CASE WHEN $5::text = \'sku\' AND $6::text = \'desc\' THEN p."sku" END DESC,',
  '  CASE WHEN $5::text = \'warehouseName\' AND $6::text = \'asc\' THEN w."name" END ASC,',
  '  CASE WHEN $5::text = \'warehouseName\' AND $6::text = \'desc\' THEN w."name" END DESC,',
  '  CASE WHEN $5::text = \'warehouseCode\' AND $6::text = \'asc\' THEN w."code" END ASC,',
  '  CASE WHEN $5::text = \'warehouseCode\' AND $6::text = \'desc\' THEN w."code" END DESC,',
  '  CASE WHEN $5::text = \'quantityOnHand\' AND $6::text = \'asc\' THEN i."quantity_on_hand" END ASC,',
  '  CASE WHEN $5::text = \'quantityOnHand\' AND $6::text = \'desc\' THEN i."quantity_on_hand" END DESC,',
  '  CASE WHEN $5::text = \'quantityReserved\' AND $6::text = \'asc\' THEN i."quantity_reserved" END ASC,',
  '  CASE WHEN $5::text = \'quantityReserved\' AND $6::text = \'desc\' THEN i."quantity_reserved" END DESC,',
  '  CASE WHEN $5::text = \'quantityAvailable\' AND $6::text = \'asc\' THEN (i."quantity_on_hand" - i."quantity_reserved") END ASC,',
  '  CASE WHEN $5::text = \'quantityAvailable\' AND $6::text = \'desc\' THEN (i."quantity_on_hand" - i."quantity_reserved") END DESC,',
  '  CASE WHEN $5::text = \'reorderLevel\' AND $6::text = \'asc\' THEN p."reorder_point" END ASC,',
  '  CASE WHEN $5::text = \'reorderLevel\' AND $6::text = \'desc\' THEN p."reorder_point" END DESC,',
  '  CASE WHEN $5::text = \'updatedAt\' AND $6::text = \'asc\' THEN i."updated_at" END ASC,',
  '  CASE WHEN $5::text = \'updatedAt\' AND $6::text = \'desc\' THEN i."updated_at" END DESC,',
  '  i."id" ASC',
  'LIMIT $7 OFFSET $8',
].join('\n');

const BALANCE_COUNT_QUERY = [
  'SELECT COUNT(*)::integer AS "totalItems"',
  'FROM "inventory_items" i',
  'INNER JOIN "products" p ON p."id" = i."product_id"',
  'INNER JOIN "warehouses" w ON w."id" = i."warehouse_id"',
  'WHERE ($1::uuid IS NULL OR i."product_id" = $1::uuid)',
  '  AND ($2::uuid IS NULL OR i."warehouse_id" = $2::uuid)',
  '  AND (',
  '    $3::text IS NULL',
  '    OR p."sku" ILIKE $3',
  '    OR p."name" ILIKE $3',
  '    OR COALESCE(p."barcode", \'\') ILIKE $3',
  '    OR w."code" ILIKE $3',
  '    OR w."name" ILIKE $3',
  '  )',
  '  AND (',
  '    $4::text IS NULL',
  '    OR CASE',
  '      WHEN (i."quantity_on_hand" - i."quantity_reserved") <= 0 THEN \'out-of-stock\'',
  '      WHEN (i."quantity_on_hand" - i."quantity_reserved") <= p."reorder_point" THEN \'low-stock\'',
  '      ELSE \'in-stock\'',
  '    END = $4::text',
  '  )',
].join('\n');

const TOTALS_QUERY = [
  'SELECT',
  '  COALESCE(SUM(i."quantity_on_hand"), 0)::text AS "quantityOnHand",',
  '  COALESCE(SUM(i."quantity_reserved"), 0)::text AS "quantityReserved",',
  '  COALESCE(SUM(i."quantity_on_hand" - i."quantity_reserved"), 0)::text AS "quantityAvailable",',
  '  COUNT(*) FILTER (',
  '    WHERE (i."quantity_on_hand" - i."quantity_reserved") > 0',
  '      AND (i."quantity_on_hand" - i."quantity_reserved") <= p."reorder_point"',
  '  )::integer AS "lowStockLines",',
  '  COUNT(*) FILTER (',
  '    WHERE (i."quantity_on_hand" - i."quantity_reserved") <= 0',
  '  )::integer AS "outOfStockLines"',
  'FROM "inventory_items" i',
  'INNER JOIN "products" p ON p."id" = i."product_id"',
  'WHERE ($1::uuid IS NULL OR i."product_id" = $1::uuid)',
  '  AND ($2::uuid IS NULL OR i."warehouse_id" = $2::uuid)',
].join('\n');

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listBalances(query: InventoryBalanceQueryDto) {
    return this.queryBalancePage({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      sort: query.sort,
      direction: query.resolvedOrder,
      productId: query.productId,
      warehouseId: query.warehouseId,
      status: query.status,
    });
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

  async productInventory(
    productId: string,
    query: PaginationQueryDto,
  ) {
    const product =
      await this.prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          sku: true,
          name: true,
          reorderPoint: true,
          isActive: true,
          unit: {
            select: {
              name: true,
              symbol: true,
            },
          },
        },
      });

    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product was not found',
      });
    }

    const [totals, balances] = await Promise.all([
      this.queryTotals({ productId }),
      this.queryBalancePage({
        page: query.page,
        pageSize: query.pageSize,
        sort: 'warehouseName',
        direction: 'asc',
        productId,
      }),
    ]);

    return {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        ...(product.unit
          ? {
              unitName: product.unit.name,
              unitSymbol: product.unit.symbol,
            }
          : {}),
        reorderLevel: Number(
          product.reorderPoint.toString(),
        ),
        active: product.isActive,
      },
      totals,
      balances,
    };
  }

  async warehouseInventory(
    warehouseId: string,
    query: PaginationQueryDto,
  ) {
    const warehouse =
      await this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: {
          id: true,
          code: true,
          name: true,
          location: true,
          isActive: true,
        },
      });

    if (!warehouse) {
      throw new NotFoundException({
        code: 'WAREHOUSE_NOT_FOUND',
        message: 'Warehouse was not found',
      });
    }

    const [totals, balances] = await Promise.all([
      this.queryTotals({ warehouseId }),
      this.queryBalancePage({
        page: query.page,
        pageSize: query.pageSize,
        sort: 'productName',
        direction: 'asc',
        warehouseId,
      }),
    ]);

    return {
      warehouse: {
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        ...(warehouse.location
          ? { location: warehouse.location }
          : {}),
        active: warehouse.isActive,
      },
      totals,
      balances,
    };
  }

  private async queryBalancePage(
    input: BalanceQueryInput,
  ) {
    this.assertSort(input.sort);

    const search = input.search?.trim();
    const searchPattern = search
      ? '%' + search + '%'
      : null;
    const productId = input.productId ?? null;
    const warehouseId = input.warehouseId ?? null;
    const status = input.status ?? null;
    const sort = input.sort ?? 'productName';
    const offset =
      (input.page - 1) * input.pageSize;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        InventoryBalanceRow[]
      >(
        BALANCE_QUERY,
        productId,
        warehouseId,
        searchPattern,
        status,
        sort,
        input.direction,
        input.pageSize,
        offset,
      ),
      this.prisma.$queryRawUnsafe<
        InventoryCountRow[]
      >(
        BALANCE_COUNT_QUERY,
        productId,
        warehouseId,
        searchPattern,
        status,
      ),
    ]);

    return toPaginatedResult(
      rows.map((row) => this.toBalance(row)),
      countRows[0]?.totalItems ?? 0,
      {
        page: input.page,
        pageSize: input.pageSize,
      },
    );
  }

  private async queryTotals(filters: {
    productId?: string;
    warehouseId?: string;
  }) {
    const rows =
      await this.prisma.$queryRawUnsafe<
        InventoryTotalsRow[]
      >(
        TOTALS_QUERY,
        filters.productId ?? null,
        filters.warehouseId ?? null,
      );

    const row = rows[0];

    return {
      quantityOnHand: Number(
        row?.quantityOnHand ?? 0,
      ),
      quantityReserved: Number(
        row?.quantityReserved ?? 0,
      ),
      quantityAvailable: Number(
        row?.quantityAvailable ?? 0,
      ),
      lowStockLines: row?.lowStockLines ?? 0,
      outOfStockLines:
        row?.outOfStockLines ?? 0,
    };
  }

  private assertSort(
    sort: string | undefined,
  ): void {
    const allowed = new Set([
      'productName',
      'sku',
      'warehouseName',
      'warehouseCode',
      'quantityOnHand',
      'quantityReserved',
      'quantityAvailable',
      'reorderLevel',
      'updatedAt',
    ]);

    if (
      sort !== undefined &&
      !allowed.has(sort)
    ) {
      throw new ApiException({
        code: 'INVALID_SORT_FIELD',
        message:
          'Unsupported sort field for inventory balances',
        statusCode: HttpStatus.BAD_REQUEST,
        details: { sort },
      });
    }
  }

  private toBalance(row: InventoryBalanceRow) {
    return {
      id: row.id,
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      ...(row.unitName
        ? { unitName: row.unitName }
        : {}),
      ...(row.unitSymbol
        ? { unitSymbol: row.unitSymbol }
        : {}),
      warehouseId: row.warehouseId,
      warehouseCode: row.warehouseCode,
      warehouseName: row.warehouseName,
      quantityOnHand: Number(
        row.quantityOnHand,
      ),
      quantityReserved: Number(
        row.quantityReserved,
      ),
      quantityAvailable: Number(
        row.quantityAvailable,
      ),
      reorderLevel: Number(
        row.reorderLevel,
      ),
      status: row.status,
      updatedAt: row.updatedAt,
    };
  }
}
