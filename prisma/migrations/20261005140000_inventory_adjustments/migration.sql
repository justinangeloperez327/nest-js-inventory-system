CREATE TYPE "InventoryAdjustmentDirection" AS ENUM (
  'INCREASE',
  'DECREASE'
);

CREATE TYPE "InventoryAdjustmentStatus" AS ENUM (
  'DRAFT',
  'POSTED',
  'CANCELLED'
);

CREATE SEQUENCE "inventory_adjustment_number_seq"
START WITH 1
INCREMENT BY 1
NO MINVALUE
NO MAXVALUE
CACHE 1;

CREATE TABLE "inventory_adjustments" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "product_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "direction" "InventoryAdjustmentDirection" NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "reason_code" TEXT NOT NULL,
  "notes" TEXT,
  "status" "InventoryAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
  "balance_before" DECIMAL(19,4),
  "balance_after" DECIMAL(19,4),
  "movement_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "posted_by_user_id" UUID,
  "posted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_adjustments_number_key" UNIQUE ("number"),
  CONSTRAINT "inventory_adjustments_movement_id_key" UNIQUE ("movement_id"),
  CONSTRAINT "inventory_adjustments_positive_quantity" CHECK (
    "quantity" > 0
  ),
  CONSTRAINT "inventory_adjustments_posting_shape" CHECK (
    (
      "status" = 'POSTED'
      AND "movement_id" IS NOT NULL
      AND "posted_by_user_id" IS NOT NULL
      AND "posted_at" IS NOT NULL
      AND "balance_before" IS NOT NULL
      AND "balance_after" IS NOT NULL
    )
    OR (
      "status" <> 'POSTED'
      AND "movement_id" IS NULL
      AND "posted_by_user_id" IS NULL
      AND "posted_at" IS NULL
      AND "balance_before" IS NULL
      AND "balance_after" IS NULL
    )
  )
);

CREATE INDEX "inventory_adjustments_product_id_created_at_idx"
ON "inventory_adjustments"("product_id", "created_at");

CREATE INDEX "inventory_adjustments_warehouse_id_created_at_idx"
ON "inventory_adjustments"("warehouse_id", "created_at");

CREATE INDEX "inventory_adjustments_status_created_at_idx"
ON "inventory_adjustments"("status", "created_at");

CREATE INDEX "inventory_adjustments_direction_created_at_idx"
ON "inventory_adjustments"("direction", "created_at");

CREATE INDEX "inventory_adjustments_created_by_user_id_idx"
ON "inventory_adjustments"("created_by_user_id");

CREATE INDEX "inventory_adjustments_posted_by_user_id_idx"
ON "inventory_adjustments"("posted_by_user_id");

ALTER TABLE "inventory_adjustments"
ADD CONSTRAINT "inventory_adjustments_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustments"
ADD CONSTRAINT "inventory_adjustments_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustments"
ADD CONSTRAINT "inventory_adjustments_movement_id_fkey"
FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustments"
ADD CONSTRAINT "inventory_adjustments_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustments"
ADD CONSTRAINT "inventory_adjustments_posted_by_user_id_fkey"
FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION protect_inventory_adjustment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inventory adjustments cannot be deleted';
  END IF;

  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'posted or cancelled inventory adjustments are immutable';
  END IF;

  IF NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'inventory adjustment identity fields are immutable';
  END IF;

  IF NEW."status" = 'POSTED'
     AND (
       NEW."product_id" IS DISTINCT FROM OLD."product_id"
       OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
       OR NEW."direction" IS DISTINCT FROM OLD."direction"
       OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
       OR NEW."reason_code" IS DISTINCT FROM OLD."reason_code"
       OR NEW."notes" IS DISTINCT FROM OLD."notes"
     ) THEN
    RAISE EXCEPTION 'posting cannot alter inventory adjustment draft fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "inventory_adjustments_protected"
BEFORE UPDATE OR DELETE ON "inventory_adjustments"
FOR EACH ROW
EXECUTE FUNCTION protect_inventory_adjustment();
