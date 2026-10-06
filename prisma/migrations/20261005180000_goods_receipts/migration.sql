CREATE TYPE "GoodsReceiptStatus" AS ENUM (
  'DRAFT',
  'POSTED',
  'CANCELLED'
);

CREATE SEQUENCE "goods_receipt_number_seq"
START WITH 1
INCREMENT BY 1
NO MINVALUE
NO MAXVALUE
CACHE 1;

CREATE TABLE "goods_receipts" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "receipt_date" DATE NOT NULL,
  "supplier_delivery_reference" TEXT,
  "notes" TEXT,
  "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "posted_by_user_id" UUID,
  "posted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goods_receipts_number_key" UNIQUE ("number"),
  CONSTRAINT "goods_receipts_posting_shape" CHECK (
    (
      "status" = 'POSTED'
      AND "posted_by_user_id" IS NOT NULL
      AND "posted_at" IS NOT NULL
    )
    OR (
      "status" <> 'POSTED'
      AND "posted_by_user_id" IS NULL
      AND "posted_at" IS NULL
    )
  )
);

CREATE TABLE "goods_receipt_lines" (
  "id" UUID NOT NULL,
  "goods_receipt_id" UUID NOT NULL,
  "purchase_order_line_id" UUID NOT NULL,
  "quantity_received" DECIMAL(19,4) NOT NULL,
  "quantity_received_before" DECIMAL(19,4),
  "balance_before" DECIMAL(19,4),
  "balance_after" DECIMAL(19,4),
  "movement_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goods_receipt_lines_goods_receipt_id_purchase_order_line_id_key"
    UNIQUE ("goods_receipt_id", "purchase_order_line_id"),
  CONSTRAINT "goods_receipt_lines_movement_id_key"
    UNIQUE ("movement_id"),
  CONSTRAINT "goods_receipt_lines_positive_quantity" CHECK (
    "quantity_received" > 0
  ),
  CONSTRAINT "goods_receipt_lines_posting_shape" CHECK (
    (
      "movement_id" IS NULL
      AND "quantity_received_before" IS NULL
      AND "balance_before" IS NULL
      AND "balance_after" IS NULL
    )
    OR (
      "movement_id" IS NOT NULL
      AND "quantity_received_before" IS NOT NULL
      AND "balance_before" IS NOT NULL
      AND "balance_after" IS NOT NULL
    )
  )
);

CREATE INDEX "goods_receipts_purchase_order_id_receipt_date_idx"
ON "goods_receipts"("purchase_order_id", "receipt_date");

CREATE INDEX "goods_receipts_status_receipt_date_idx"
ON "goods_receipts"("status", "receipt_date");

CREATE INDEX "goods_receipts_created_by_user_id_idx"
ON "goods_receipts"("created_by_user_id");

CREATE INDEX "goods_receipts_posted_by_user_id_idx"
ON "goods_receipts"("posted_by_user_id");

CREATE INDEX "goods_receipts_created_at_idx"
ON "goods_receipts"("created_at");

CREATE INDEX "goods_receipt_lines_purchase_order_line_id_idx"
ON "goods_receipt_lines"("purchase_order_line_id");

ALTER TABLE "goods_receipts"
ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey"
FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipts"
ADD CONSTRAINT "goods_receipts_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipts"
ADD CONSTRAINT "goods_receipts_posted_by_user_id_fkey"
FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_lines"
ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_fkey"
FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_lines"
ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_fkey"
FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_lines"
ADD CONSTRAINT "goods_receipt_lines_movement_id_fkey"
FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION protect_goods_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'goods receipts cannot be deleted';
  END IF;

  IF NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."purchase_order_id" IS DISTINCT FROM OLD."purchase_order_id"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'goods receipt identity fields are immutable';
  END IF;

  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'posted or cancelled goods receipts are immutable';
  END IF;

  IF NEW."status" = 'POSTED'
     AND (
       NEW."receipt_date" IS DISTINCT FROM OLD."receipt_date"
       OR NEW."supplier_delivery_reference" IS DISTINCT FROM OLD."supplier_delivery_reference"
       OR NEW."notes" IS DISTINCT FROM OLD."notes"
     ) THEN
    RAISE EXCEPTION 'posting cannot alter goods receipt draft fields';
  END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'POSTED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'invalid goods receipt status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "goods_receipts_protected"
BEFORE UPDATE OR DELETE ON "goods_receipts"
FOR EACH ROW
EXECUTE FUNCTION protect_goods_receipt();

CREATE OR REPLACE FUNCTION protect_goods_receipt_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_status "GoodsReceiptStatus";
DECLARE parent_id UUID;
BEGIN
  parent_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."goods_receipt_id"
    ELSE NEW."goods_receipt_id"
  END;

  SELECT "status" INTO parent_status
  FROM "goods_receipts"
  WHERE "id" = parent_id;

  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'posted or cancelled goods receipt lines are immutable';
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."goods_receipt_id" IS DISTINCT FROM OLD."goods_receipt_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'goods receipt line identity fields are immutable';
  END IF;

  IF OLD."movement_id" IS NOT NULL THEN
    RAISE EXCEPTION 'posted goods receipt line audit is immutable';
  END IF;

  IF NEW."movement_id" IS NOT NULL
     AND (
       NEW."purchase_order_line_id" IS DISTINCT FROM OLD."purchase_order_line_id"
       OR NEW."quantity_received" IS DISTINCT FROM OLD."quantity_received"
     ) THEN
    RAISE EXCEPTION 'posting cannot alter goods receipt line draft fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "goods_receipt_lines_protected"
BEFORE INSERT OR UPDATE OR DELETE ON "goods_receipt_lines"
FOR EACH ROW
EXECUTE FUNCTION protect_goods_receipt_line();
