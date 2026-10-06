CREATE TYPE "StockCountStatus" AS ENUM (
  'DRAFT',
  'COUNTING',
  'SUBMITTED',
  'POSTED',
  'CANCELLED'
);

CREATE SEQUENCE "stock_count_number_seq"
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE "stock_counts" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "notes" TEXT,
  "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "started_by_user_id" UUID,
  "submitted_by_user_id" UUID,
  "approved_by_user_id" UUID,
  "started_at" TIMESTAMPTZ(3),
  "submitted_at" TIMESTAMPTZ(3),
  "approved_at" TIMESTAMPTZ(3),
  "posted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_counts_number_key" UNIQUE ("number"),
  CONSTRAINT "stock_counts_workflow_shape" CHECK (
    (
      "status" = 'DRAFT'
      AND "started_by_user_id" IS NULL
      AND "started_at" IS NULL
      AND "submitted_by_user_id" IS NULL
      AND "submitted_at" IS NULL
      AND "approved_by_user_id" IS NULL
      AND "approved_at" IS NULL
      AND "posted_at" IS NULL
    )
    OR (
      "status" = 'COUNTING'
      AND "started_by_user_id" IS NOT NULL
      AND "started_at" IS NOT NULL
      AND "submitted_by_user_id" IS NULL
      AND "submitted_at" IS NULL
      AND "approved_by_user_id" IS NULL
      AND "approved_at" IS NULL
      AND "posted_at" IS NULL
    )
    OR (
      "status" = 'SUBMITTED'
      AND "started_by_user_id" IS NOT NULL
      AND "started_at" IS NOT NULL
      AND "submitted_by_user_id" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "approved_by_user_id" IS NULL
      AND "approved_at" IS NULL
      AND "posted_at" IS NULL
    )
    OR (
      "status" = 'POSTED'
      AND "started_by_user_id" IS NOT NULL
      AND "started_at" IS NOT NULL
      AND "submitted_by_user_id" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "approved_by_user_id" IS NOT NULL
      AND "approved_at" IS NOT NULL
      AND "posted_at" IS NOT NULL
    )
    OR (
      "status" = 'CANCELLED'
      AND "approved_by_user_id" IS NULL
      AND "approved_at" IS NULL
      AND "posted_at" IS NULL
    )
  )
);

CREATE TABLE "stock_count_lines" (
  "id" UUID NOT NULL,
  "stock_count_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "expected_quantity" DECIMAL(19,4) NOT NULL,
  "counted_quantity" DECIMAL(19,4),
  "variance_quantity" DECIMAL(19,4),
  "snapshot_unit_cost" DECIMAL(19,4) NOT NULL,
  "balance_before" DECIMAL(19,4),
  "balance_after" DECIMAL(19,4),
  "movement_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_count_lines_stock_count_id_product_id_key"
    UNIQUE ("stock_count_id", "product_id"),
  CONSTRAINT "stock_count_lines_movement_id_key" UNIQUE ("movement_id"),
  CONSTRAINT "stock_count_lines_snapshot_cost_nonnegative" CHECK (
    "snapshot_unit_cost" >= 0
  ),
  CONSTRAINT "stock_count_lines_counted_nonnegative" CHECK (
    "counted_quantity" IS NULL OR "counted_quantity" >= 0
  ),
  CONSTRAINT "stock_count_lines_variance_consistent" CHECK (
    (
      "counted_quantity" IS NULL
      AND "variance_quantity" IS NULL
    )
    OR (
      "counted_quantity" IS NOT NULL
      AND "variance_quantity" = "counted_quantity" - "expected_quantity"
    )
  ),
  CONSTRAINT "stock_count_lines_movement_shape" CHECK (
    (
      "movement_id" IS NULL
      AND "balance_before" IS NULL
      AND "balance_after" IS NULL
    )
    OR (
      "movement_id" IS NOT NULL
      AND "variance_quantity" IS NOT NULL
      AND "variance_quantity" <> 0
      AND "balance_before" IS NOT NULL
      AND "balance_after" IS NOT NULL
    )
  )
);

CREATE INDEX "stock_counts_warehouse_id_created_at_idx"
ON "stock_counts"("warehouse_id", "created_at");

CREATE INDEX "stock_counts_status_created_at_idx"
ON "stock_counts"("status", "created_at");

CREATE UNIQUE INDEX "stock_counts_active_warehouse_key"
ON "stock_counts"("warehouse_id")
WHERE "status" IN ('COUNTING', 'SUBMITTED');

CREATE INDEX "stock_counts_created_by_user_id_idx"
ON "stock_counts"("created_by_user_id");
CREATE INDEX "stock_counts_started_by_user_id_idx"
ON "stock_counts"("started_by_user_id");
CREATE INDEX "stock_counts_submitted_by_user_id_idx"
ON "stock_counts"("submitted_by_user_id");
CREATE INDEX "stock_counts_approved_by_user_id_idx"
ON "stock_counts"("approved_by_user_id");

CREATE INDEX "stock_count_lines_product_id_idx"
ON "stock_count_lines"("product_id");
CREATE INDEX "stock_count_lines_stock_count_id_variance_quantity_idx"
ON "stock_count_lines"("stock_count_id", "variance_quantity");

ALTER TABLE "stock_counts"
ADD CONSTRAINT "stock_counts_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts"
ADD CONSTRAINT "stock_counts_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts"
ADD CONSTRAINT "stock_counts_started_by_user_id_fkey"
FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts"
ADD CONSTRAINT "stock_counts_submitted_by_user_id_fkey"
FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_counts"
ADD CONSTRAINT "stock_counts_approved_by_user_id_fkey"
FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_count_lines"
ADD CONSTRAINT "stock_count_lines_stock_count_id_fkey"
FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines"
ADD CONSTRAINT "stock_count_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines"
ADD CONSTRAINT "stock_count_lines_movement_id_fkey"
FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION protect_stock_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock counts cannot be deleted';
  END IF;

  IF NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'stock count identity fields are immutable';
  END IF;

  IF OLD."started_by_user_id" IS NOT NULL
     AND (
       NEW."started_by_user_id" IS DISTINCT FROM OLD."started_by_user_id"
       OR NEW."started_at" IS DISTINCT FROM OLD."started_at"
     ) THEN
    RAISE EXCEPTION 'stock count start audit is immutable';
  END IF;

  IF OLD."submitted_by_user_id" IS NOT NULL
     AND (
       NEW."submitted_by_user_id" IS DISTINCT FROM OLD."submitted_by_user_id"
       OR NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
     ) THEN
    RAISE EXCEPTION 'stock count submission audit is immutable';
  END IF;

  IF OLD."approved_by_user_id" IS NOT NULL
     AND (
       NEW."approved_by_user_id" IS DISTINCT FROM OLD."approved_by_user_id"
       OR NEW."approved_at" IS DISTINCT FROM OLD."approved_at"
       OR NEW."posted_at" IS DISTINCT FROM OLD."posted_at"
     ) THEN
    RAISE EXCEPTION 'stock count approval audit is immutable';
  END IF;

  IF NEW."status" = 'SUBMITTED' AND OLD."status" <> 'SUBMITTED' THEN
    IF EXISTS (
      SELECT 1
      FROM "stock_count_lines"
      WHERE "stock_count_id" = OLD."id"
        AND "counted_quantity" IS NULL
    ) THEN
      RAISE EXCEPTION 'all stock count lines must be counted before submission';
    END IF;
  END IF;

  IF NEW."status" = 'POSTED' AND OLD."status" <> 'POSTED' THEN
    IF EXISTS (
      SELECT 1
      FROM "stock_count_lines"
      WHERE "stock_count_id" = OLD."id"
        AND (
          "counted_quantity" IS NULL
          OR "variance_quantity" IS NULL
          OR ("variance_quantity" <> 0 AND "movement_id" IS NULL)
          OR ("variance_quantity" = 0 AND "movement_id" IS NOT NULL)
        )
    ) THEN
      RAISE EXCEPTION 'stock count lines are not fully prepared for posting';
    END IF;
  END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'COUNTING', 'CANCELLED'))
    OR
    (OLD."status" = 'COUNTING' AND NEW."status" IN ('COUNTING', 'SUBMITTED', 'CANCELLED'))
    OR
    (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('SUBMITTED', 'POSTED', 'CANCELLED'))
    OR
    (OLD."status" = 'POSTED' AND NEW."status" = 'POSTED')
    OR
    (OLD."status" = 'CANCELLED' AND NEW."status" = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'invalid stock count status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "stock_counts_protected"
BEFORE UPDATE OR DELETE ON "stock_counts"
FOR EACH ROW EXECUTE FUNCTION protect_stock_count();

CREATE OR REPLACE FUNCTION protect_stock_count_line()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "StockCountStatus";
DECLARE parent_id UUID;
BEGIN
  parent_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."stock_count_id"
    ELSE NEW."stock_count_id"
  END;

  SELECT "status" INTO parent_status
  FROM "stock_counts"
  WHERE "id" = parent_id;

  IF TG_OP = 'INSERT' THEN
    IF parent_status <> 'COUNTING' THEN
      RAISE EXCEPTION 'stock count lines can only be created while counting';
    END IF;

    IF NEW."counted_quantity" IS NOT NULL
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
     OR NEW."expected_quantity" IS DISTINCT FROM OLD."expected_quantity"
     OR NEW."snapshot_unit_cost" IS DISTINCT FROM OLD."snapshot_unit_cost"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'stock count snapshot fields are immutable';
  END IF;

  IF parent_status = 'COUNTING' THEN
    IF NEW."movement_id" IS NOT NULL
       OR NEW."balance_before" IS NOT NULL
       OR NEW."balance_after" IS NOT NULL THEN
      RAISE EXCEPTION 'counting lines cannot contain posting audit data';
    END IF;

    RETURN NEW;
  END IF;

  IF parent_status = 'SUBMITTED' THEN
    IF NEW."counted_quantity" IS DISTINCT FROM OLD."counted_quantity"
       OR NEW."variance_quantity" IS DISTINCT FROM OLD."variance_quantity" THEN
      RAISE EXCEPTION 'submitted counted quantities are immutable';
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

CREATE TRIGGER "stock_count_lines_protected"
BEFORE INSERT OR UPDATE OR DELETE ON "stock_count_lines"
FOR EACH ROW EXECUTE FUNCTION protect_stock_count_line();

CREATE OR REPLACE FUNCTION block_movement_during_stock_count()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active_count_id UUID;
BEGIN
  SELECT "id" INTO active_count_id
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

  RAISE EXCEPTION 'inventory movement blocked by active stock count';
END;
$$;

CREATE TRIGGER "stock_movements_blocked_during_count"
BEFORE INSERT ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION block_movement_during_stock_count();

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
  ) THEN
    RAISE EXCEPTION 'inventory reservation blocked by active stock count';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "inventory_reservations_blocked_during_count"
BEFORE UPDATE OF "quantity_reserved" ON "inventory_items"
FOR EACH ROW EXECUTE FUNCTION block_reservation_during_stock_count();
