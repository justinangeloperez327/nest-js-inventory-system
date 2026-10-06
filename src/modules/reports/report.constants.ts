export const REPORT_IDS = [
  'inventory-balance',
  'inventory-valuation',
  'stock-movements',
  'low-stock',
  'out-of-stock',
  'purchase-history',
  'receiving',
  'supplier-purchases',
  'adjustments',
  'transfers',
  'stock-count-variance',
  'sales-orders',
  'sales-returns',
] as const;

export type ReportId =
  (typeof REPORT_IDS)[number];

export const REPORT_EXPORT_MAX_ROWS = 50_000;
