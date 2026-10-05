export const INVENTORY_ADJUSTMENT_DIRECTIONS = [
  'increase',
  'decrease',
] as const;

export type InventoryAdjustmentDirection =
  (typeof INVENTORY_ADJUSTMENT_DIRECTIONS)[number];

export const INVENTORY_ADJUSTMENT_STATUSES = [
  'draft',
  'posted',
  'cancelled',
] as const;

export type InventoryAdjustmentStatus =
  (typeof INVENTORY_ADJUSTMENT_STATUSES)[number];

export interface InventoryAdjustmentReason {
  code: string;
  label: string;
  direction?: InventoryAdjustmentDirection;
}

export const INVENTORY_ADJUSTMENT_REASONS: readonly InventoryAdjustmentReason[] = [
  {
    code: 'manual-correction',
    label: 'Manual correction',
  },
  {
    code: 'data-correction',
    label: 'Data correction',
  },
  {
    code: 'found-stock',
    label: 'Found stock',
    direction: 'increase',
  },
  {
    code: 'damage',
    label: 'Damaged stock',
    direction: 'decrease',
  },
  {
    code: 'expired',
    label: 'Expired stock',
    direction: 'decrease',
  },
  {
    code: 'shrinkage',
    label: 'Shrinkage / loss',
    direction: 'decrease',
  },
];

export const ADJUSTMENT_DIRECTION_TO_DB = {
  increase: 'INCREASE',
  decrease: 'DECREASE',
} as const;

export const ADJUSTMENT_DIRECTION_FROM_DB = {
  INCREASE: 'increase',
  DECREASE: 'decrease',
} as const;

export const ADJUSTMENT_STATUS_TO_DB = {
  draft: 'DRAFT',
  posted: 'POSTED',
  cancelled: 'CANCELLED',
} as const;

export const ADJUSTMENT_STATUS_FROM_DB = {
  DRAFT: 'draft',
  POSTED: 'posted',
  CANCELLED: 'cancelled',
} as const;
