export const SETTINGS_KEYS = {
  OrganizationName: 'application.organizationName',
  Timezone: 'application.timezone',
  CurrencyCode: 'application.currencyCode',
  DefaultPageSize: 'inventory.defaultPageSize',
  AllowNegativeStock: 'inventory.allowNegativeStock',
  StockCountConcurrencyPolicy:
    'inventory.stockCountConcurrencyPolicy',
} as const;

export const STOCK_COUNT_CONCURRENCY_POLICIES = [
  'freeze',
  'reconcile',
] as const;

export type StockCountConcurrencyPolicy =
  (typeof STOCK_COUNT_CONCURRENCY_POLICIES)[number];

export const DEFAULT_APPLICATION_SETTINGS = {
  organizationName: 'Inventory System',
  timezone: 'UTC',
  currencyCode: 'AED',
  defaultPageSize: 25,
  allowNegativeStock: false,
  stockCountConcurrencyPolicy:
    'freeze' as StockCountConcurrencyPolicy,
} as const;
