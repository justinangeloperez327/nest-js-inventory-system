export const STOCK_MOVEMENT_TYPES = [
  'receipt',
  'sale',
  'transfer-in',
  'transfer-out',
  'adjustment-in',
  'adjustment-out',
  'return-in',
  'return-out',
  'stock-count',
] as const;

export type StockMovementType =
  (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_DB_TYPE = {
  receipt: 'RECEIPT',
  sale: 'SALE',
  'transfer-in': 'TRANSFER_IN',
  'transfer-out': 'TRANSFER_OUT',
  'adjustment-in': 'ADJUSTMENT_IN',
  'adjustment-out': 'ADJUSTMENT_OUT',
  'return-in': 'RETURN_IN',
  'return-out': 'RETURN_OUT',
  'stock-count': 'STOCK_COUNT',
} as const satisfies Record<StockMovementType, string>;

export const STOCK_MOVEMENT_API_TYPE = {
  RECEIPT: 'receipt',
  SALE: 'sale',
  TRANSFER_IN: 'transfer-in',
  TRANSFER_OUT: 'transfer-out',
  ADJUSTMENT_IN: 'adjustment-in',
  ADJUSTMENT_OUT: 'adjustment-out',
  RETURN_IN: 'return-in',
  RETURN_OUT: 'return-out',
  STOCK_COUNT: 'stock-count',
} as const;

export interface StockMovementReferenceInput {
  type: string;
  id: string;
  number: string;
  referencePath?: string;
}

export interface ApplyStockMovementInput {
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantityChange: number;
  unitCost?: number;
  reference?: StockMovementReferenceInput;
  notes?: string;
  performedByUserId?: string;
  occurredAt?: Date;
}


export interface ApplyReservedSaleInput {
  productId: string;
  warehouseId: string;
  quantity: number;
  reference?: StockMovementReferenceInput;
  notes?: string;
  performedByUserId?: string;
  occurredAt?: Date;
}
