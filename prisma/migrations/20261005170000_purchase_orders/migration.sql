CREATE TYPE "PurchaseOrderStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED'
);

CREATE SEQUENCE "purchase_order_number_seq"
START WITH 1
INCREMENT BY 1
NO MINVALUE
NO MAXVALUE
CACHE 1;

CREATE TABLE "purchase_orders" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "supplier_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "order_date" DATE NOT NULL,
  "expected_date" DATE,
  "notes" TEXT,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "currency_code" VARCHAR(3) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "submitted_by_user_id" UUID,
  "approved_by_user_id" UUID,
  "submitted_at" TIMESTAMPTZ(3),
  "approved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_orders_number_key" UNIQUE ("number"),
  CONSTRAINT "purchase_orders_subtotal_nonnegative" CHECK ("subtotal" >= 0),
  CONSTRAINT "purchase_orders_currency_code_shape" CHECK (
    "currency_code" ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT "purchase_orders_expected_date" CHECK (
    "expected_date" IS NULL OR "expected_date" >= "order_date"
  ),
  CONSTRAINT "purchase_orders_workflow_shape" CHECK (
    (
      "status" = 'DRAFT'
      AND "submitted_by_user_id" IS NULL
      AND "submitted_at" IS NULL
      AND "approved_by_user_id" IS NULL
      AND "approved_at" IS NULL
    )
    OR (
      "status" = 'SUBMITTED'
      AND "submitted_by_user_id" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "approved_by_user_id" IS NULL
      AND "approved_at" IS NULL
    )
    OR (
      "status" IN ('APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED')
      AND "submitted_by_user_id" IS NOT NULL
      AND "submitted_at" IS NOT NULL
      AND "approved_by_user_id" IS NOT NULL
      AND "approved_at" IS NOT NULL
    )
    OR (
      "status" = 'CANCELLED'
      AND (("submitted_by_user_id" IS NULL) = ("submitted_at" IS NULL))
      AND (("approved_by_user_id" IS NULL) = ("approved_at" IS NULL))
      AND ("approved_by_user_id" IS NULL OR "submitted_by_user_id" IS NOT NULL)
    )
  )
);

CREATE TABLE "purchase_order_lines" (
  "id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_price" DECIMAL(19,4) NOT NULL,
  "line_total" DECIMAL(19,4) NOT NULL,
  "quantity_received" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_lines_purchase_order_id_product_id_key"
    UNIQUE ("purchase_order_id", "product_id"),
  CONSTRAINT "purchase_order_lines_positive_quantity" CHECK (
    "quantity" > 0
  ),
  CONSTRAINT "purchase_order_lines_unit_price_nonnegative" CHECK (
    "unit_price" >= 0
  ),
  CONSTRAINT "purchase_order_lines_total_consistent" CHECK (
    "line_total" = ROUND("quantity" * "unit_price", 4)
  ),
  CONSTRAINT "purchase_order_lines_received_range" CHECK (
    "quantity_received" >= 0
    AND "quantity_received" <= "quantity"
  )
);

CREATE INDEX "purchase_orders_supplier_id_order_date_idx"
ON "purchase_orders"("supplier_id", "order_date");

CREATE INDEX "purchase_orders_warehouse_id_order_date_idx"
ON "purchase_orders"("warehouse_id", "order_date");

CREATE INDEX "purchase_orders_status_order_date_idx"
ON "purchase_orders"("status", "order_date");

CREATE INDEX "purchase_orders_created_by_user_id_idx"
ON "purchase_orders"("created_by_user_id");

CREATE INDEX "purchase_orders_submitted_by_user_id_idx"
ON "purchase_orders"("submitted_by_user_id");

CREATE INDEX "purchase_orders_approved_by_user_id_idx"
ON "purchase_orders"("approved_by_user_id");

CREATE INDEX "purchase_orders_created_at_idx"
ON "purchase_orders"("created_at");

CREATE INDEX "purchase_order_lines_product_id_idx"
ON "purchase_order_lines"("product_id");

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_supplier_id_fkey"
FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_submitted_by_user_id_fkey"
FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
ADD CONSTRAINT "purchase_orders_approved_by_user_id_fkey"
FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines"
ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey"
FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines"
ADD CONSTRAINT "purchase_order_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION protect_purchase_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'purchase orders cannot be deleted';
  END IF;

  IF NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."currency_code" IS DISTINCT FROM OLD."currency_code"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'purchase order identity fields are immutable';
  END IF;

  IF OLD."status" <> 'DRAFT'
     AND (
       NEW."supplier_id" IS DISTINCT FROM OLD."supplier_id"
       OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
       OR NEW."order_date" IS DISTINCT FROM OLD."order_date"
       OR NEW."expected_date" IS DISTINCT FROM OLD."expected_date"
       OR NEW."notes" IS DISTINCT FROM OLD."notes"
       OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     ) THEN
    RAISE EXCEPTION 'submitted purchase order commercial fields are immutable';
  END IF;

  IF OLD."submitted_by_user_id" IS NOT NULL
     AND (
       NEW."submitted_by_user_id" IS DISTINCT FROM OLD."submitted_by_user_id"
       OR NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
     ) THEN
    RAISE EXCEPTION 'purchase order submission audit is immutable';
  END IF;

  IF OLD."approved_by_user_id" IS NOT NULL
     AND (
       NEW."approved_by_user_id" IS DISTINCT FROM OLD."approved_by_user_id"
       OR NEW."approved_at" IS DISTINCT FROM OLD."approved_at"
     ) THEN
    RAISE EXCEPTION 'purchase order approval audit is immutable';
  END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'SUBMITTED', 'CANCELLED'))
    OR
    (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('SUBMITTED', 'APPROVED', 'CANCELLED'))
    OR
    (OLD."status" = 'APPROVED' AND NEW."status" IN ('APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'))
    OR
    (OLD."status" = 'PARTIALLY_RECEIVED' AND NEW."status" IN ('PARTIALLY_RECEIVED', 'RECEIVED'))
    OR
    (OLD."status" = 'RECEIVED' AND NEW."status" = 'RECEIVED')
    OR
    (OLD."status" = 'CANCELLED' AND NEW."status" = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'invalid purchase order status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_orders_protected"
BEFORE UPDATE OR DELETE ON "purchase_orders"
FOR EACH ROW
EXECUTE FUNCTION protect_purchase_order();

CREATE OR REPLACE FUNCTION protect_purchase_order_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_status "PurchaseOrderStatus";
DECLARE parent_id UUID;
BEGIN
  parent_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."purchase_order_id"
    ELSE NEW."purchase_order_id"
  END;

  SELECT "status" INTO parent_status
  FROM "purchase_orders"
  WHERE "id" = parent_id;

  IF TG_OP = 'INSERT' THEN
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'lines can only be added to draft purchase orders';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'lines can only be deleted from draft purchase orders';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
     OR NEW."purchase_order_id" IS DISTINCT FROM OLD."purchase_order_id" THEN
    RAISE EXCEPTION 'purchase order line identity fields are immutable';
  END IF;

  IF parent_status = 'DRAFT' THEN
    IF NEW."quantity_received" IS DISTINCT FROM OLD."quantity_received"
       AND NEW."quantity_received" <> 0 THEN
      RAISE EXCEPTION 'draft purchase orders cannot contain received quantity';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."product_id" IS DISTINCT FROM OLD."product_id"
     OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
     OR NEW."unit_price" IS DISTINCT FROM OLD."unit_price"
     OR NEW."line_total" IS DISTINCT FROM OLD."line_total" THEN
    RAISE EXCEPTION 'submitted purchase order line commercial fields are immutable';
  END IF;

  IF NEW."quantity_received" IS DISTINCT FROM OLD."quantity_received" THEN
    IF parent_status NOT IN ('APPROVED', 'PARTIALLY_RECEIVED') THEN
      RAISE EXCEPTION 'purchase order is not eligible for receiving';
    END IF;

    IF NEW."quantity_received" < OLD."quantity_received" THEN
      RAISE EXCEPTION 'received quantity cannot decrease';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_order_lines_protected"
BEFORE INSERT OR UPDATE OR DELETE ON "purchase_order_lines"
FOR EACH ROW
EXECUTE FUNCTION protect_purchase_order_line();

CREATE OR REPLACE FUNCTION sync_purchase_order_subtotal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_id UUID;
DECLARE parent_status "PurchaseOrderStatus";
BEGIN
  parent_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."purchase_order_id"
    ELSE NEW."purchase_order_id"
  END;

  SELECT "status" INTO parent_status
  FROM "purchase_orders"
  WHERE "id" = parent_id;

  IF parent_status = 'DRAFT' THEN
    UPDATE "purchase_orders"
    SET "subtotal" = COALESCE(
      (
        SELECT SUM("line_total")
        FROM "purchase_order_lines"
        WHERE "purchase_order_id" = parent_id
      ),
      0
    )
    WHERE "id" = parent_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_order_lines_sync_subtotal"
AFTER INSERT OR UPDATE OR DELETE ON "purchase_order_lines"
FOR EACH ROW
EXECUTE FUNCTION sync_purchase_order_subtotal();
