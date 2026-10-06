import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../database/prisma.service.js';
import { Permission } from '../access-control/rbac.constants.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { STOCK_MOVEMENT_API_TYPE } from '../stock-movements/stock-movement.types.js';

interface GeneratedAtRow {
  generatedAt: Date;
}

interface MetricsRow {
  totalProducts: number;
  totalSkus: number;
  totalWarehouses: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  pendingPurchaseOrders: number;
  pendingReceipts: number;
  inventoryValue: string;
}

interface StockRiskRow {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  warehouseName: string;
  quantityOnHand: string;
  reorderLevel: string;
  status: 'low' | 'out-of-stock';
}

interface PendingPurchaseOrderRow {
  id: string;
  number: string;
  supplierName: string;
  status:
    | 'DRAFT'
    | 'SUBMITTED'
    | 'APPROVED'
    | 'PARTIALLY_RECEIVED';
  expectedDate: Date | null;
}

interface PendingReceiptRow {
  id: string;
  number: string;
  purchaseOrderNumber: string;
  supplierName: string;
  status: 'pending' | 'in-progress';
  expectedDate: Date | null;
}

interface RecentMovementRow {
  id: string;
  occurredAt: Date;
  sku: string;
  productName: string;
  warehouseName: string;
  dbType: keyof typeof STOCK_MOVEMENT_API_TYPE;
  quantity: string;
  referenceNumber: string | null;
}

const METRICS_QUERY = [
  'SELECT',
  '  (',
  '    SELECT COUNT(*)::integer',
  '    FROM "products"',
  '    WHERE "is_active" = true',
  '  ) AS "totalProducts",',
  '  (',
  '    SELECT COUNT(DISTINCT ii."product_id")::integer',
  '    FROM "inventory_items" ii',
  '    INNER JOIN "products" p ON p."id" = ii."product_id"',
  '    INNER JOIN "warehouses" w ON w."id" = ii."warehouse_id"',
  '    WHERE p."is_active" = true',
  '      AND p."is_trackable" = true',
  '      AND w."is_active" = true',
  '  ) AS "totalSkus",',
  '  (',
  '    SELECT COUNT(*)::integer',
  '    FROM "warehouses"',
  '    WHERE "is_active" = true',
  '  ) AS "totalWarehouses",',
  '  (',
  '    SELECT COUNT(DISTINCT ii."product_id")::integer',
  '    FROM "inventory_items" ii',
  '    INNER JOIN "products" p ON p."id" = ii."product_id"',
  '    INNER JOIN "warehouses" w ON w."id" = ii."warehouse_id"',
  '    WHERE p."is_active" = true',
  '      AND p."is_trackable" = true',
  '      AND w."is_active" = true',
  '      AND (ii."quantity_on_hand" - ii."quantity_reserved") > 0',
  '      AND (ii."quantity_on_hand" - ii."quantity_reserved") <= p."reorder_point"',
  '  ) AS "lowStockProducts",',
  '  (',
  '    SELECT COUNT(DISTINCT ii."product_id")::integer',
  '    FROM "inventory_items" ii',
  '    INNER JOIN "products" p ON p."id" = ii."product_id"',
  '    INNER JOIN "warehouses" w ON w."id" = ii."warehouse_id"',
  '    WHERE p."is_active" = true',
  '      AND p."is_trackable" = true',
  '      AND w."is_active" = true',
  '      AND (ii."quantity_on_hand" - ii."quantity_reserved") <= 0',
  '  ) AS "outOfStockProducts",',
  '  (',
  '    SELECT COUNT(*)::integer',
  '    FROM "purchase_orders"',
  '    WHERE "status" IN (\'DRAFT\', \'SUBMITTED\', \'APPROVED\', \'PARTIALLY_RECEIVED\')',
  '  ) AS "pendingPurchaseOrders",',
  '  (',
  '    SELECT COUNT(*)::integer',
  '    FROM "purchase_orders"',
  '    WHERE "status" IN (\'APPROVED\', \'PARTIALLY_RECEIVED\')',
  '  ) AS "pendingReceipts",',
  '  (',
  '    SELECT COALESCE(SUM(ii."quantity_on_hand" * ii."average_cost"), 0)::text',
  '    FROM "inventory_items" ii',
  '    INNER JOIN "products" p ON p."id" = ii."product_id"',
  '    INNER JOIN "warehouses" w ON w."id" = ii."warehouse_id"',
  '    WHERE p."is_active" = true',
  '      AND p."is_trackable" = true',
  '      AND w."is_active" = true',
  '  ) AS "inventoryValue"',
].join('\n');

const STOCK_RISKS_QUERY = [
  'SELECT',
  '  ii."id"::text AS "id",',
  '  p."id"::text AS "productId",',
  '  p."sku" AS "sku",',
  '  p."name" AS "productName",',
  '  w."name" AS "warehouseName",',
  '  ii."quantity_on_hand"::text AS "quantityOnHand",',
  '  p."reorder_point"::text AS "reorderLevel",',
  '  CASE',
  '    WHEN (ii."quantity_on_hand" - ii."quantity_reserved") <= 0 THEN \'out-of-stock\'',
  '    ELSE \'low\'',
  '  END AS "status"',
  'FROM "inventory_items" ii',
  'INNER JOIN "products" p ON p."id" = ii."product_id"',
  'INNER JOIN "warehouses" w ON w."id" = ii."warehouse_id"',
  'WHERE p."is_active" = true',
  '  AND p."is_trackable" = true',
  '  AND w."is_active" = true',
  '  AND (ii."quantity_on_hand" - ii."quantity_reserved") <= p."reorder_point"',
  'ORDER BY',
  '  CASE WHEN (ii."quantity_on_hand" - ii."quantity_reserved") <= 0 THEN 0 ELSE 1 END ASC,',
  '  (ii."quantity_on_hand" - ii."quantity_reserved") ASC,',
  '  p."name" ASC,',
  '  w."name" ASC',
  'LIMIT 10',
].join('\n');

const PENDING_PURCHASE_ORDERS_QUERY = [
  'SELECT',
  '  po."id"::text AS "id",',
  '  po."number" AS "number",',
  '  s."name" AS "supplierName",',
  '  po."status"::text AS "status",',
  '  po."expected_date" AS "expectedDate"',
  'FROM "purchase_orders" po',
  'INNER JOIN "suppliers" s ON s."id" = po."supplier_id"',
  'WHERE po."status" IN (\'DRAFT\', \'SUBMITTED\', \'APPROVED\', \'PARTIALLY_RECEIVED\')',
  'ORDER BY',
  '  CASE po."status"',
  '    WHEN \'SUBMITTED\' THEN 0',
  '    WHEN \'DRAFT\' THEN 1',
  '    WHEN \'APPROVED\' THEN 2',
  '    ELSE 3',
  '  END ASC,',
  '  po."expected_date" ASC NULLS LAST,',
  '  po."created_at" ASC',
  'LIMIT 8',
].join('\n');

const PENDING_RECEIPTS_QUERY = [
  'SELECT',
  '  COALESCE(gr."id", po."id")::text AS "id",',
  '  COALESCE(gr."number", po."number") AS "number",',
  '  po."number" AS "purchaseOrderNumber",',
  '  s."name" AS "supplierName",',
  '  CASE',
  '    WHEN gr."id" IS NOT NULL OR po."status" = \'PARTIALLY_RECEIVED\' THEN \'in-progress\'',
  '    ELSE \'pending\'',
  '  END AS "status",',
  '  po."expected_date" AS "expectedDate"',
  'FROM "purchase_orders" po',
  'INNER JOIN "suppliers" s ON s."id" = po."supplier_id"',
  'LEFT JOIN LATERAL (',
  '  SELECT',
  '    r."id",',
  '    r."number"',
  '  FROM "goods_receipts" r',
  '  WHERE r."purchase_order_id" = po."id"',
  '    AND r."status" = \'DRAFT\'',
  '  ORDER BY r."created_at" DESC',
  '  LIMIT 1',
  ') gr ON true',
  'WHERE po."status" IN (\'APPROVED\', \'PARTIALLY_RECEIVED\')',
  'ORDER BY',
  '  CASE WHEN po."status" = \'PARTIALLY_RECEIVED\' OR gr."id" IS NOT NULL THEN 0 ELSE 1 END ASC,',
  '  po."expected_date" ASC NULLS LAST,',
  '  po."approved_at" ASC NULLS LAST,',
  '  po."created_at" ASC',
  'LIMIT 8',
].join('\n');

const RECENT_MOVEMENTS_QUERY = [
  'SELECT',
  '  m."id"::text AS "id",',
  '  m."occurred_at" AS "occurredAt",',
  '  p."sku" AS "sku",',
  '  p."name" AS "productName",',
  '  w."name" AS "warehouseName",',
  '  m."type"::text AS "dbType",',
  '  m."quantity_change"::text AS "quantity",',
  '  m."reference_number" AS "referenceNumber"',
  'FROM "stock_movements" m',
  'INNER JOIN "products" p ON p."id" = m."product_id"',
  'INNER JOIN "warehouses" w ON w."id" = m."warehouse_id"',
  'ORDER BY',
  '  m."occurred_at" DESC,',
  '  m."created_at" DESC,',
  '  m."id" DESC',
  'LIMIT 10',
].join('\n');

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getDashboard(user: AuthUser) {
    const permissions = new Set(
      user.permissions,
    );
    const canReadInventory =
      permissions.has(Permission.InventoryRead);
    const canReadPurchases =
      permissions.has(Permission.PurchasesRead);
    const canReceive =
      permissions.has(
        Permission.PurchasesReceive,
      );

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
        );

        const timeRows =
          await tx.$queryRawUnsafe<
            GeneratedAtRow[]
          >(
            'SELECT transaction_timestamp() AS "generatedAt"',
          );

        const metricsRows =
          await tx.$queryRawUnsafe<
            MetricsRow[]
          >(METRICS_QUERY);
        const metrics =
          metricsRows[0] ??
          this.emptyMetrics();

        const stockRisks =
          canReadInventory
            ? await tx.$queryRawUnsafe<
                StockRiskRow[]
              >(STOCK_RISKS_QUERY)
            : [];

        const pendingPurchaseOrders =
          canReadPurchases
            ? await tx.$queryRawUnsafe<
                PendingPurchaseOrderRow[]
              >(
                PENDING_PURCHASE_ORDERS_QUERY,
              )
            : [];

        const pendingReceipts =
          canReceive
            ? await tx.$queryRawUnsafe<
                PendingReceiptRow[]
              >(PENDING_RECEIPTS_QUERY)
            : [];

        const recentMovements =
          canReadInventory
            ? await tx.$queryRawUnsafe<
                RecentMovementRow[]
              >(RECENT_MOVEMENTS_QUERY)
            : [];

        return {
          generatedAt:
            timeRows[0]?.generatedAt ??
            new Date(),
          metrics: {
            totalProducts:
              metrics.totalProducts,
            totalSkus: metrics.totalSkus,
            totalWarehouses:
              metrics.totalWarehouses,
            lowStockProducts:
              metrics.lowStockProducts,
            outOfStockProducts:
              metrics.outOfStockProducts,
            pendingPurchaseOrders:
              metrics.pendingPurchaseOrders,
            pendingReceipts:
              metrics.pendingReceipts,
            inventoryValue: Number(
              metrics.inventoryValue,
            ),
            currencyCode:
              this.currencyCode(),
          },
          stockRisks: stockRisks.map(
            (row) => ({
              id: row.id,
              productId: row.productId,
              sku: row.sku,
              productName:
                row.productName,
              warehouseName:
                row.warehouseName,
              quantityOnHand: Number(
                row.quantityOnHand,
              ),
              reorderLevel: Number(
                row.reorderLevel,
              ),
              status: row.status,
            }),
          ),
          pendingPurchaseOrders:
            pendingPurchaseOrders.map(
              (row) => ({
                id: row.id,
                number: row.number,
                supplierName:
                  row.supplierName,
                status:
                  this.purchaseOrderStatus(
                    row.status,
                  ),
                ...(row.expectedDate
                  ? {
                      expectedDate:
                        this.dateOnly(
                          row.expectedDate,
                        ),
                    }
                  : {}),
              }),
            ),
          pendingReceipts:
            pendingReceipts.map(
              (row) => ({
                id: row.id,
                number: row.number,
                purchaseOrderNumber:
                  row.purchaseOrderNumber,
                supplierName:
                  row.supplierName,
                status: row.status,
                ...(row.expectedDate
                  ? {
                      expectedDate:
                        this.dateOnly(
                          row.expectedDate,
                        ),
                    }
                  : {}),
              }),
            ),
          recentMovements:
            recentMovements.map(
              (row) => ({
                id: row.id,
                occurredAt:
                  row.occurredAt,
                sku: row.sku,
                productName:
                  row.productName,
                warehouseName:
                  row.warehouseName,
                type:
                  STOCK_MOVEMENT_API_TYPE[
                    row.dbType
                  ],
                quantity: Number(
                  row.quantity,
                ),
                ...(row.referenceNumber
                  ? {
                      reference:
                        row.referenceNumber,
                    }
                  : {}),
              }),
            ),
        };
      },
    );
  }

  private purchaseOrderStatus(
    status: PendingPurchaseOrderRow['status'],
  ):
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'partially-received' {
    switch (status) {
      case 'DRAFT':
        return 'draft';
      case 'SUBMITTED':
        return 'submitted';
      case 'APPROVED':
        return 'approved';
      case 'PARTIALLY_RECEIVED':
        return 'partially-received';
    }
  }

  private emptyMetrics(): MetricsRow {
    return {
      totalProducts: 0,
      totalSkus: 0,
      totalWarehouses: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
      pendingPurchaseOrders: 0,
      pendingReceipts: 0,
      inventoryValue: '0',
    };
  }

  private currencyCode(): string {
    return (
      this.config.get<string>(
        'app.currencyCode',
      ) ?? 'AED'
    );
  }

  private dateOnly(date: Date): string {
    return date
      .toISOString()
      .slice(0, 10);
  }
}
