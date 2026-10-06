export const GOODS_RECEIPT_STATUSES = [
  'draft',
  'posted',
  'cancelled',
] as const;

export type GoodsReceiptStatus =
  (typeof GOODS_RECEIPT_STATUSES)[number];

export const GOODS_RECEIPT_STATUS_TO_DB = {
  draft: 'DRAFT',
  posted: 'POSTED',
  cancelled: 'CANCELLED',
} as const;

export const GOODS_RECEIPT_STATUS_FROM_DB = {
  DRAFT: 'draft',
  POSTED: 'posted',
  CANCELLED: 'cancelled',
} as const;
