export const SALES_ORDER_STATUSES = [
  'draft',
  'confirmed',
  'dispatched',
  'completed',
  'cancelled',
] as const;

export type SalesOrderStatus =
  (typeof SALES_ORDER_STATUSES)[number];

export const SALES_ORDER_STATUS_TO_DB = {
  draft: 'DRAFT',
  confirmed: 'CONFIRMED',
  dispatched: 'DISPATCHED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
} as const;

export const SALES_ORDER_STATUS_FROM_DB = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  DISPATCHED: 'dispatched',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
