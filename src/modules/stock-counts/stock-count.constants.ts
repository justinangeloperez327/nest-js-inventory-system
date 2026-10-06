export const STOCK_COUNT_STATUSES = [
  'draft',
  'counting',
  'submitted',
  'posted',
  'cancelled',
] as const;

export type StockCountStatus =
  (typeof STOCK_COUNT_STATUSES)[number];

export const STOCK_COUNT_STATUS_TO_DB = {
  draft: 'DRAFT',
  counting: 'COUNTING',
  submitted: 'SUBMITTED',
  posted: 'POSTED',
  cancelled: 'CANCELLED',
} as const;

export const STOCK_COUNT_STATUS_FROM_DB = {
  DRAFT: 'draft',
  COUNTING: 'counting',
  SUBMITTED: 'submitted',
  POSTED: 'posted',
  CANCELLED: 'cancelled',
} as const;
