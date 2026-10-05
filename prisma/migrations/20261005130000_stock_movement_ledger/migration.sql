CREATE TYPE "StockMovementType" AS ENUM (
  'RECEIPT',
  'SALE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'RETURN_IN',
  'RETURN_OUT',
  'STOCK_COUNT'
);

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity_change" DECIMAL(19,4) NOT NULL,
  "unit_cost" DECIMAL(19,4),
  "balance_before" DECIMAL(19,4) NOT NULL,
  "balance_after" DECIMAL(19,4) NOT NULL,
  "reference_type" TEXT,
  "reference_id" TEXT,
  "reference_number" TEXT,
  "reference_path" TEXT,
  "notes" TEXT,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "performed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movements_unit_cost_nonnegative" CHECK (
    "unit_cost" IS NULL OR "unit_cost" >= 0
  ),
  CONSTRAINT "stock_movements_quantity_direction" CHECK (
    "quantity_change" = 0
    OR ("type" IN ('RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN_IN') AND "quantity_change" > 0)
    OR ("type" IN ('SALE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'RETURN_OUT') AND "quantity_change" < 0)
    OR "type" = 'STOCK_COUNT'
  ),
  CONSTRAINT "stock_movements_reference_shape" CHECK (
    (
      "reference_type" IS NULL
      AND "reference_id" IS NULL
      AND "reference_number" IS NULL
      AND "reference_path" IS NULL
    )
    OR (
      "reference_type" IS NOT NULL
      AND "reference_id" IS NOT NULL
      AND "reference_number" IS NOT NULL
    )
  ),
  CONSTRAINT "stock_movements_reference_path_local" CHECK (
    "reference_path" IS NULL
    OR (
      LEFT("reference_path", 1) = '/'
      AND LEFT("reference_path", 2) <> '//'
    )
  )
);

CREATE INDEX "stock_movements_product_id_occurred_at_idx"
ON "stock_movements"("product_id", "occurred_at");

CREATE INDEX "stock_movements_warehouse_id_occurred_at_idx"
ON "stock_movements"("warehouse_id", "occurred_at");

CREATE INDEX "stock_movements_type_occurred_at_idx"
ON "stock_movements"("type", "occurred_at");

CREATE INDEX "stock_movements_reference_type_reference_id_idx"
ON "stock_movements"("reference_type", "reference_id");

CREATE INDEX "stock_movements_reference_number_idx"
ON "stock_movements"("reference_number");

CREATE INDEX "stock_movements_performed_by_user_id_idx"
ON "stock_movements"("performed_by_user_id");

CREATE INDEX "stock_movements_occurred_at_idx"
ON "stock_movements"("occurred_at");

ALTER TABLE "stock_movements"
ADD CONSTRAINT "stock_movements_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
ADD CONSTRAINT "stock_movements_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
ADD CONSTRAINT "stock_movements_performed_by_user_id_fkey"
FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_stock_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stock movements are immutable';
END;
$$;

CREATE TRIGGER "stock_movements_immutable"
BEFORE UPDATE OR DELETE ON "stock_movements"
FOR EACH ROW
EXECUTE FUNCTION prevent_stock_movement_mutation();
