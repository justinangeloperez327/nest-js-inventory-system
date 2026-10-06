CREATE TYPE "SalesOrderStatus" AS ENUM (
  'DRAFT',
  'CONFIRMED',
  'DISPATCHED',
  'COMPLETED',
  'CANCELLED'
);

CREATE SEQUENCE "sales_order_number_seq"
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE SEQUENCE "sales_return_number_seq"
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE "sales_orders" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "customer_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "order_date" DATE NOT NULL,
  "notes" TEXT,
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "currency_code" VARCHAR(3) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "confirmed_by_user_id" UUID,
  "cancelled_by_user_id" UUID,
  "dispatched_by_user_id" UUID,
  "completed_by_user_id" UUID,
  "confirmed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "dispatched_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_orders_number_key" UNIQUE ("number"),
  CONSTRAINT "sales_orders_subtotal_nonnegative" CHECK ("subtotal" >= 0),
  CONSTRAINT "sales_orders_currency_code_shape" CHECK (
    "currency_code" ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT "sales_orders_workflow_shape" CHECK (
    (
      "status" = 'DRAFT'
      AND "confirmed_by_user_id" IS NULL
      AND "confirmed_at" IS NULL
      AND "cancelled_by_user_id" IS NULL
      AND "cancelled_at" IS NULL
      AND "dispatched_by_user_id" IS NULL
      AND "dispatched_at" IS NULL
      AND "completed_by_user_id" IS NULL
      AND "completed_at" IS NULL
    )
    OR (
      "status" = 'CONFIRMED'
      AND "confirmed_by_user_id" IS NOT NULL
      AND "confirmed_at" IS NOT NULL
      AND "cancelled_by_user_id" IS NULL
      AND "cancelled_at" IS NULL
      AND "dispatched_by_user_id" IS NULL
      AND "dispatched_at" IS NULL
      AND "completed_by_user_id" IS NULL
      AND "completed_at" IS NULL
    )
    OR (
      "status" = 'CANCELLED'
      AND "confirmed_by_user_id" IS NOT NULL
      AND "confirmed_at" IS NOT NULL
      AND "cancelled_by_user_id" IS NOT NULL
      AND "cancelled_at" IS NOT NULL
      AND "dispatched_by_user_id" IS NULL
      AND "dispatched_at" IS NULL
      AND "completed_by_user_id" IS NULL
      AND "completed_at" IS NULL
    )
    OR (
      "status" = 'DISPATCHED'
      AND "confirmed_by_user_id" IS NOT NULL
      AND "confirmed_at" IS NOT NULL
      AND "cancelled_by_user_id" IS NULL
      AND "cancelled_at" IS NULL
      AND "dispatched_by_user_id" IS NOT NULL
      AND "dispatched_at" IS NOT NULL
      AND "completed_by_user_id" IS NULL
      AND "completed_at" IS NULL
    )
    OR (
      "status" = 'COMPLETED'
      AND "confirmed_by_user_id" IS NOT NULL
      AND "confirmed_at" IS NOT NULL
      AND "cancelled_by_user_id" IS NULL
      AND "cancelled_at" IS NULL
      AND "dispatched_by_user_id" IS NOT NULL
      AND "dispatched_at" IS NOT NULL
      AND "completed_by_user_id" IS NOT NULL
      AND "completed_at" IS NOT NULL
    )
  )
);

CREATE TABLE "sales_order_lines" (
  "id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit_price" DECIMAL(19,4) NOT NULL,
  "line_total" DECIMAL(19,4) NOT NULL,
  "quantity_reserved" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "quantity_dispatched" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "quantity_returned" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "sale_movement_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_order_lines_sales_order_id_product_id_key"
    UNIQUE ("sales_order_id", "product_id"),
  CONSTRAINT "sales_order_lines_sale_movement_id_key"
    UNIQUE ("sale_movement_id"),
  CONSTRAINT "sales_order_lines_positive_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "sales_order_lines_unit_price_nonnegative" CHECK ("unit_price" >= 0),
  CONSTRAINT "sales_order_lines_total_consistent" CHECK (
    "line_total" = ROUND("quantity" * "unit_price", 4)
  ),
  CONSTRAINT "sales_order_lines_reserved_shape" CHECK (
    "quantity_reserved" IN (0, "quantity")
  ),
  CONSTRAINT "sales_order_lines_dispatched_shape" CHECK (
    "quantity_dispatched" IN (0, "quantity")
  ),
  CONSTRAINT "sales_order_lines_return_range" CHECK (
    "quantity_returned" >= 0
    AND "quantity_returned" <= "quantity_dispatched"
  ),
  CONSTRAINT "sales_order_lines_sale_movement_shape" CHECK (
    (
      "sale_movement_id" IS NULL
      AND "quantity_dispatched" = 0
    )
    OR (
      "sale_movement_id" IS NOT NULL
      AND "quantity_dispatched" = "quantity"
      AND "quantity_reserved" = 0
    )
  )
);

CREATE TABLE "sales_returns" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "notes" TEXT,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_returns_number_key" UNIQUE ("number")
);

CREATE TABLE "sales_return_lines" (
  "id" UUID NOT NULL,
  "sales_return_id" UUID NOT NULL,
  "sales_order_line_id" UUID NOT NULL,
  "quantity_returned" DECIMAL(19,4) NOT NULL,
  "movement_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_return_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_return_lines_sales_return_id_sales_order_line_id_key"
    UNIQUE ("sales_return_id", "sales_order_line_id"),
  CONSTRAINT "sales_return_lines_movement_id_key" UNIQUE ("movement_id"),
  CONSTRAINT "sales_return_lines_positive_quantity" CHECK (
    "quantity_returned" > 0
  )
);

CREATE INDEX "sales_orders_customer_id_order_date_idx"
ON "sales_orders"("customer_id", "order_date");
CREATE INDEX "sales_orders_warehouse_id_order_date_idx"
ON "sales_orders"("warehouse_id", "order_date");
CREATE INDEX "sales_orders_status_order_date_idx"
ON "sales_orders"("status", "order_date");
CREATE INDEX "sales_orders_created_by_user_id_idx"
ON "sales_orders"("created_by_user_id");
CREATE INDEX "sales_orders_confirmed_by_user_id_idx"
ON "sales_orders"("confirmed_by_user_id");
CREATE INDEX "sales_orders_cancelled_by_user_id_idx"
ON "sales_orders"("cancelled_by_user_id");
CREATE INDEX "sales_orders_dispatched_by_user_id_idx"
ON "sales_orders"("dispatched_by_user_id");
CREATE INDEX "sales_orders_completed_by_user_id_idx"
ON "sales_orders"("completed_by_user_id");
CREATE INDEX "sales_orders_created_at_idx"
ON "sales_orders"("created_at");
CREATE INDEX "sales_order_lines_product_id_idx"
ON "sales_order_lines"("product_id");
CREATE INDEX "sales_returns_sales_order_id_created_at_idx"
ON "sales_returns"("sales_order_id", "created_at");
CREATE INDEX "sales_returns_created_by_user_id_idx"
ON "sales_returns"("created_by_user_id");
CREATE INDEX "sales_return_lines_sales_order_line_id_idx"
ON "sales_return_lines"("sales_order_line_id");

ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_confirmed_by_user_id_fkey"
FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_cancelled_by_user_id_fkey"
FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_dispatched_by_user_id_fkey"
FOREIGN KEY ("dispatched_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_completed_by_user_id_fkey"
FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_lines"
ADD CONSTRAINT "sales_order_lines_sales_order_id_fkey"
FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_order_lines"
ADD CONSTRAINT "sales_order_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_order_lines"
ADD CONSTRAINT "sales_order_lines_sale_movement_id_fkey"
FOREIGN KEY ("sale_movement_id") REFERENCES "stock_movements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_returns"
ADD CONSTRAINT "sales_returns_sales_order_id_fkey"
FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_returns"
ADD CONSTRAINT "sales_returns_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_return_lines"
ADD CONSTRAINT "sales_return_lines_sales_return_id_fkey"
FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_lines"
ADD CONSTRAINT "sales_return_lines_sales_order_line_id_fkey"
FOREIGN KEY ("sales_order_line_id") REFERENCES "sales_order_lines"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_lines"
ADD CONSTRAINT "sales_return_lines_movement_id_fkey"
FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION protect_sales_order()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sales orders cannot be deleted';
  END IF;

  IF NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."currency_code" IS DISTINCT FROM OLD."currency_code"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'sales order identity fields are immutable';
  END IF;

  IF OLD."status" <> 'DRAFT'
     AND (
       NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
       OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
       OR NEW."order_date" IS DISTINCT FROM OLD."order_date"
       OR NEW."notes" IS DISTINCT FROM OLD."notes"
       OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     ) THEN
    RAISE EXCEPTION 'confirmed sales order commercial fields are immutable';
  END IF;

  IF OLD."confirmed_by_user_id" IS NOT NULL
     AND (
       NEW."confirmed_by_user_id" IS DISTINCT FROM OLD."confirmed_by_user_id"
       OR NEW."confirmed_at" IS DISTINCT FROM OLD."confirmed_at"
     ) THEN
    RAISE EXCEPTION 'sales order confirmation audit is immutable';
  END IF;

  IF OLD."cancelled_by_user_id" IS NOT NULL
     AND (
       NEW."cancelled_by_user_id" IS DISTINCT FROM OLD."cancelled_by_user_id"
       OR NEW."cancelled_at" IS DISTINCT FROM OLD."cancelled_at"
     ) THEN
    RAISE EXCEPTION 'sales order cancellation audit is immutable';
  END IF;

  IF OLD."dispatched_by_user_id" IS NOT NULL
     AND (
       NEW."dispatched_by_user_id" IS DISTINCT FROM OLD."dispatched_by_user_id"
       OR NEW."dispatched_at" IS DISTINCT FROM OLD."dispatched_at"
     ) THEN
    RAISE EXCEPTION 'sales order dispatch audit is immutable';
  END IF;

  IF OLD."completed_by_user_id" IS NOT NULL
     AND (
       NEW."completed_by_user_id" IS DISTINCT FROM OLD."completed_by_user_id"
       OR NEW."completed_at" IS DISTINCT FROM OLD."completed_at"
     ) THEN
    RAISE EXCEPTION 'sales order completion audit is immutable';
  END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'CONFIRMED'))
    OR
    (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('CONFIRMED', 'CANCELLED', 'DISPATCHED'))
    OR
    (OLD."status" = 'DISPATCHED' AND NEW."status" IN ('DISPATCHED', 'COMPLETED'))
    OR
    (OLD."status" = 'COMPLETED' AND NEW."status" = 'COMPLETED')
    OR
    (OLD."status" = 'CANCELLED' AND NEW."status" = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'invalid sales order status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sales_orders_protected"
BEFORE UPDATE OR DELETE ON "sales_orders"
FOR EACH ROW EXECUTE FUNCTION protect_sales_order();

CREATE OR REPLACE FUNCTION protect_sales_order_line()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "SalesOrderStatus";
DECLARE parent_id UUID;
BEGIN
  parent_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."sales_order_id"
    ELSE NEW."sales_order_id"
  END;

  SELECT "status" INTO parent_status
  FROM "sales_orders"
  WHERE "id" = parent_id;

  IF TG_OP = 'INSERT' THEN
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'lines can only be added to draft sales orders';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'lines can only be deleted from draft sales orders';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."sales_order_id" IS DISTINCT FROM OLD."sales_order_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'sales order line identity fields are immutable';
  END IF;

  IF parent_status = 'DRAFT' THEN
    IF NEW."quantity_reserved" <> 0
       OR NEW."quantity_dispatched" <> 0
       OR NEW."quantity_returned" <> 0
       OR NEW."sale_movement_id" IS NOT NULL THEN
      RAISE EXCEPTION 'draft sales order lines cannot contain inventory audit quantities';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."product_id" IS DISTINCT FROM OLD."product_id"
     OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
     OR NEW."unit_price" IS DISTINCT FROM OLD."unit_price"
     OR NEW."line_total" IS DISTINCT FROM OLD."line_total" THEN
    RAISE EXCEPTION 'confirmed sales order line commercial fields are immutable';
  END IF;

  IF OLD."sale_movement_id" IS NOT NULL
     AND NEW."sale_movement_id" IS DISTINCT FROM OLD."sale_movement_id" THEN
    RAISE EXCEPTION 'sale movement reference is immutable';
  END IF;

  IF NEW."quantity_dispatched" < OLD."quantity_dispatched" THEN
    RAISE EXCEPTION 'dispatched quantity cannot decrease';
  END IF;

  IF parent_status IN ('DISPATCHED', 'COMPLETED') THEN
    IF NEW."quantity_reserved" IS DISTINCT FROM OLD."quantity_reserved"
       OR NEW."quantity_dispatched" IS DISTINCT FROM OLD."quantity_dispatched"
       OR NEW."sale_movement_id" IS DISTINCT FROM OLD."sale_movement_id" THEN
      RAISE EXCEPTION 'dispatched sales order inventory audit is immutable';
    END IF;

    IF NEW."quantity_returned" < OLD."quantity_returned" THEN
      RAISE EXCEPTION 'returned quantity cannot decrease';
    END IF;

    RETURN NEW;
  END IF;

  IF parent_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled sales order lines are immutable';
  END IF;

  IF NEW."quantity_returned" IS DISTINCT FROM OLD."quantity_returned" THEN
    RAISE EXCEPTION 'returns require a dispatched sales order';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sales_order_lines_protected"
BEFORE INSERT OR UPDATE OR DELETE ON "sales_order_lines"
FOR EACH ROW EXECUTE FUNCTION protect_sales_order_line();

CREATE OR REPLACE FUNCTION sync_sales_order_subtotal()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id UUID;
DECLARE parent_status "SalesOrderStatus";
BEGIN
  parent_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."sales_order_id"
    ELSE NEW."sales_order_id"
  END;

  SELECT "status" INTO parent_status
  FROM "sales_orders"
  WHERE "id" = parent_id;

  IF parent_status = 'DRAFT' THEN
    UPDATE "sales_orders"
    SET "subtotal" = COALESCE(
      (
        SELECT SUM("line_total")
        FROM "sales_order_lines"
        WHERE "sales_order_id" = parent_id
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

CREATE TRIGGER "sales_order_lines_sync_subtotal"
AFTER INSERT OR UPDATE OR DELETE ON "sales_order_lines"
FOR EACH ROW EXECUTE FUNCTION sync_sales_order_subtotal();

CREATE OR REPLACE FUNCTION protect_sales_return()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sales returns are immutable';
END;
$$;

CREATE TRIGGER "sales_returns_immutable"
BEFORE UPDATE OR DELETE ON "sales_returns"
FOR EACH ROW EXECUTE FUNCTION protect_sales_return();

CREATE OR REPLACE FUNCTION protect_sales_return_line()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sales return lines are immutable';
END;
$$;

CREATE TRIGGER "sales_return_lines_immutable"
BEFORE UPDATE OR DELETE ON "sales_return_lines"
FOR EACH ROW EXECUTE FUNCTION protect_sales_return_line();
