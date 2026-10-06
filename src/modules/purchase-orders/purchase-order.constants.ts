export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'partially-received',
  'received',
  'cancelled',
] as const;

export type PurchaseOrderStatus =
  (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_STATUS_TO_DB = {
  draft: 'DRAFT',
  submitted: 'SUBMITTED',
  approved: 'APPROVED',
  'partially-received': 'PARTIALLY_RECEIVED',
  received: 'RECEIVED',
  cancelled: 'CANCELLED',
} as const;

export const PURCHASE_ORDER_STATUS_FROM_DB = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  PARTIALLY_RECEIVED: 'partially-received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
} as const;
