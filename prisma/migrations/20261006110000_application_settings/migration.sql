ALTER TABLE "system_settings"
ADD COLUMN "updated_by_user_id" UUID;

ALTER TABLE "system_settings"
ADD CONSTRAINT "system_settings_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "system_settings_updated_by_user_id_idx"
ON "system_settings"("updated_by_user_id");

INSERT INTO "system_settings" ("id", "key", "value", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'application.organizationName', '"Inventory System"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'application.timezone', '"UTC"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'application.currencyCode', '"AED"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'inventory.defaultPageSize', '25'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'inventory.allowNegativeStock', 'false'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'inventory.stockCountConcurrencyPolicy', '"freeze"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "stock_counts"
ADD COLUMN "concurrency_policy" TEXT NOT NULL DEFAULT 'freeze';

ALTER TABLE "stock_counts"
ADD CONSTRAINT "stock_counts_concurrency_policy_check"
CHECK ("concurrency_policy" IN ('freeze', 'reconcile'));

ALTER TABLE "stock_count_lines"
ADD COLUMN "counted_at" TIMESTAMPTZ(3),
ADD COLUMN "quantity_at_count" DECIMAL(19,4);


UPDATE "stock_count_lines"
SET
  "counted_at" = "updated_at",
  "quantity_at_count" = "expected_quantity"
WHERE "counted_quantity" IS NOT NULL;

ALTER TABLE "stock_count_lines"
ADD CONSTRAINT "stock_count_lines_count_context"
CHECK (
  (
    "counted_quantity" IS NULL
    AND "counted_at" IS NULL
    AND "quantity_at_count" IS NULL
  )
  OR
  (
    "counted_quantity" IS NOT NULL
    AND "counted_at" IS NOT NULL
    AND "quantity_at_count" IS NOT NULL
  )
);

CREATE OR REPLACE FUNCTION protect_stock_count_policy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'DRAFT'
     AND NEW."concurrency_policy" IS DISTINCT FROM OLD."concurrency_policy" THEN
    RAISE EXCEPTION 'stock count concurrency policy is immutable after start';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "stock_counts_concurrency_policy_protected"
BEFORE UPDATE OF "concurrency_policy" ON "stock_counts"
FOR EACH ROW
EXECUTE FUNCTION protect_stock_count_policy();

CREATE OR REPLACE FUNCTION protect_stock_count_line()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "StockCountStatus";
DECLARE parent_policy TEXT;
DECLARE parent_id UUID;
BEGIN
  parent_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."stock_count_id"
    ELSE NEW."stock_count_id"
  END;

  SELECT "status", "concurrency_policy"
  INTO parent_status, parent_policy
  FROM "stock_counts"
  WHERE "id" = parent_id;

  IF TG_OP = 'INSERT' THEN
    IF parent_status <> 'COUNTING' THEN
      RAISE EXCEPTION 'stock count lines can only be created while counting';
    END IF;

    IF NEW."counted_quantity" IS NOT NULL
       OR NEW."counted_at" IS NOT NULL
       OR NEW."quantity_at_count" IS NOT NULL
       OR NEW."variance_quantity" IS NOT NULL
       OR NEW."movement_id" IS NOT NULL THEN
      RAISE EXCEPTION 'new stock count lines must be uncounted';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock count lines cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."stock_count_id" IS DISTINCT FROM OLD."stock_count_id"
     OR NEW."product_id" IS DISTINCT FROM OLD."product_id"
     OR NEW."snapshot_unit_cost" IS DISTINCT FROM OLD."snapshot_unit_cost"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'stock count identity fields are immutable';
  END IF;

  IF parent_status = 'COUNTING' THEN
    IF parent_policy = 'freeze'
       AND NEW."expected_quantity" IS DISTINCT FROM OLD."expected_quantity" THEN
      RAISE EXCEPTION 'frozen stock count expected quantity is immutable';
    END IF;

    IF NEW."movement_id" IS NOT NULL
       OR NEW."balance_before" IS NOT NULL
       OR NEW."balance_after" IS NOT NULL THEN
      RAISE EXCEPTION 'counting lines cannot contain posting audit data';
    END IF;

    RETURN NEW;
  END IF;

  IF parent_status = 'SUBMITTED' THEN
    IF NEW."expected_quantity" IS DISTINCT FROM OLD."expected_quantity"
       OR NEW."counted_quantity" IS DISTINCT FROM OLD."counted_quantity"
       OR NEW."counted_at" IS DISTINCT FROM OLD."counted_at"
       OR NEW."quantity_at_count" IS DISTINCT FROM OLD."quantity_at_count"
       OR NEW."variance_quantity" IS DISTINCT FROM OLD."variance_quantity" THEN
      RAISE EXCEPTION 'submitted count values are immutable';
    END IF;

    IF OLD."movement_id" IS NOT NULL
       AND NEW."movement_id" IS DISTINCT FROM OLD."movement_id" THEN
      RAISE EXCEPTION 'stock count movement reference is immutable';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'posted or cancelled stock count lines are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION block_movement_during_stock_count()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active_count_id UUID;
DECLARE active_policy TEXT;
BEGIN
  SELECT "id", "concurrency_policy"
  INTO active_count_id, active_policy
  FROM "stock_counts"
  WHERE "warehouse_id" = NEW."warehouse_id"
    AND "status" IN ('COUNTING', 'SUBMITTED')
  LIMIT 1;

  IF active_count_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."type" = 'STOCK_COUNT'
     AND NEW."reference_type" = 'stock-count'
     AND NEW."reference_id" = active_count_id::text THEN
    RETURN NEW;
  END IF;

  IF active_policy = 'reconcile' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'inventory movement blocked by active frozen stock count';
END;
$$;

CREATE OR REPLACE FUNCTION block_reservation_during_stock_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."quantity_reserved" IS NOT DISTINCT FROM OLD."quantity_reserved" THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "stock_counts"
    WHERE "warehouse_id" = NEW."warehouse_id"
      AND "status" IN ('COUNTING', 'SUBMITTED')
      AND "concurrency_policy" = 'freeze'
  ) THEN
    RAISE EXCEPTION 'inventory reservation blocked by active frozen stock count';
  END IF;

  RETURN NEW;
END;
$$;
