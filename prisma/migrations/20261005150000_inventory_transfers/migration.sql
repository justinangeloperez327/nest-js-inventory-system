CREATE TYPE "InventoryTransferStatus" AS ENUM (
  'DRAFT',
  'POSTED',
  'CANCELLED'
);

CREATE SEQUENCE "inventory_transfer_number_seq"
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE "inventory_transfers" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "source_warehouse_id" UUID NOT NULL,
  "destination_warehouse_id" UUID NOT NULL,
  "notes" TEXT,
  "status" "InventoryTransferStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "posted_by_user_id" UUID,
  "posted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_transfers_number_key" UNIQUE ("number"),
  CONSTRAINT "inventory_transfers_warehouses_differ" CHECK (
    "source_warehouse_id" <> "destination_warehouse_id"
  ),
  CONSTRAINT "inventory_transfers_posting_shape" CHECK (
    ("status" = 'POSTED' AND "posted_by_user_id" IS NOT NULL AND "posted_at" IS NOT NULL)
    OR
    ("status" <> 'POSTED' AND "posted_by_user_id" IS NULL AND "posted_at" IS NULL)
  )
);

CREATE TABLE "inventory_transfer_lines" (
  "id" UUID NOT NULL,
  "transfer_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "source_balance_before" DECIMAL(19,4),
  "source_balance_after" DECIMAL(19,4),
  "destination_balance_before" DECIMAL(19,4),
  "destination_balance_after" DECIMAL(19,4),
  "outbound_movement_id" UUID,
  "inbound_movement_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_transfer_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_transfer_lines_transfer_id_product_id_key" UNIQUE ("transfer_id", "product_id"),
  CONSTRAINT "inventory_transfer_lines_outbound_movement_id_key" UNIQUE ("outbound_movement_id"),
  CONSTRAINT "inventory_transfer_lines_inbound_movement_id_key" UNIQUE ("inbound_movement_id"),
  CONSTRAINT "inventory_transfer_lines_positive_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_transfer_lines_posting_shape" CHECK (
    (
      "outbound_movement_id" IS NULL
      AND "inbound_movement_id" IS NULL
      AND "source_balance_before" IS NULL
      AND "source_balance_after" IS NULL
      AND "destination_balance_before" IS NULL
      AND "destination_balance_after" IS NULL
    )
    OR (
      "outbound_movement_id" IS NOT NULL
      AND "inbound_movement_id" IS NOT NULL
      AND "source_balance_before" IS NOT NULL
      AND "source_balance_after" IS NOT NULL
      AND "destination_balance_before" IS NOT NULL
      AND "destination_balance_after" IS NOT NULL
    )
  )
);

CREATE INDEX "inventory_transfers_source_warehouse_id_created_at_idx"
ON "inventory_transfers"("source_warehouse_id", "created_at");
CREATE INDEX "inventory_transfers_destination_warehouse_id_created_at_idx"
ON "inventory_transfers"("destination_warehouse_id", "created_at");
CREATE INDEX "inventory_transfers_status_created_at_idx"
ON "inventory_transfers"("status", "created_at");
CREATE INDEX "inventory_transfers_created_by_user_id_idx"
ON "inventory_transfers"("created_by_user_id");
CREATE INDEX "inventory_transfers_posted_by_user_id_idx"
ON "inventory_transfers"("posted_by_user_id");
CREATE INDEX "inventory_transfer_lines_product_id_idx"
ON "inventory_transfer_lines"("product_id");

ALTER TABLE "inventory_transfers"
ADD CONSTRAINT "inventory_transfers_source_warehouse_id_fkey"
FOREIGN KEY ("source_warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers"
ADD CONSTRAINT "inventory_transfers_destination_warehouse_id_fkey"
FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers"
ADD CONSTRAINT "inventory_transfers_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers"
ADD CONSTRAINT "inventory_transfers_posted_by_user_id_fkey"
FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_transfer_lines"
ADD CONSTRAINT "inventory_transfer_lines_transfer_id_fkey"
FOREIGN KEY ("transfer_id") REFERENCES "inventory_transfers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transfer_lines"
ADD CONSTRAINT "inventory_transfer_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfer_lines"
ADD CONSTRAINT "inventory_transfer_lines_outbound_movement_id_fkey"
FOREIGN KEY ("outbound_movement_id") REFERENCES "stock_movements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfer_lines"
ADD CONSTRAINT "inventory_transfer_lines_inbound_movement_id_fkey"
FOREIGN KEY ("inbound_movement_id") REFERENCES "stock_movements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION protect_inventory_transfer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inventory transfers cannot be deleted';
  END IF;
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'posted or cancelled inventory transfers are immutable';
  END IF;
  IF NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'inventory transfer identity fields are immutable';
  END IF;
  IF NEW."status" = 'POSTED'
     AND (
       NEW."source_warehouse_id" IS DISTINCT FROM OLD."source_warehouse_id"
       OR NEW."destination_warehouse_id" IS DISTINCT FROM OLD."destination_warehouse_id"
       OR NEW."notes" IS DISTINCT FROM OLD."notes"
     ) THEN
    RAISE EXCEPTION 'posting cannot alter inventory transfer draft fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "inventory_transfers_protected"
BEFORE UPDATE OR DELETE ON "inventory_transfers"
FOR EACH ROW EXECUTE FUNCTION protect_inventory_transfer();

CREATE OR REPLACE FUNCTION protect_inventory_transfer_line()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE transfer_status "InventoryTransferStatus";
BEGIN
  SELECT "status" INTO transfer_status
  FROM "inventory_transfers"
  WHERE "id" = CASE
    WHEN TG_OP = 'DELETE' THEN OLD."transfer_id"
    ELSE NEW."transfer_id"
  END;

  IF transfer_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'posted or cancelled inventory transfer lines are immutable';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."outbound_movement_id" IS NOT NULL
     AND (
       NEW."product_id" IS DISTINCT FROM OLD."product_id"
       OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
       OR NEW."transfer_id" IS DISTINCT FROM OLD."transfer_id"
     ) THEN
    RAISE EXCEPTION 'posting cannot alter inventory transfer line draft fields';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "inventory_transfer_lines_protected"
BEFORE UPDATE OR DELETE ON "inventory_transfer_lines"
FOR EACH ROW EXECUTE FUNCTION protect_inventory_transfer_line();
