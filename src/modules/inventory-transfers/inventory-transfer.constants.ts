export const INVENTORY_TRANSFER_STATUSES = [
  'draft',
  'posted',
  'cancelled',
] as const;

export type InventoryTransferStatus =
  (typeof INVENTORY_TRANSFER_STATUSES)[number];

export const TRANSFER_STATUS_TO_DB = {
  draft: 'DRAFT',
  posted: 'POSTED',
  cancelled: 'CANCELLED',
} as const;

export const TRANSFER_STATUS_FROM_DB = {
  DRAFT: 'draft',
  POSTED: 'posted',
  CANCELLED: 'cancelled',
} as const;
