CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contact_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "tax_number" TEXT,
  "address_line_1" TEXT,
  "address_line_2" TEXT,
  "city" TEXT,
  "state_province" TEXT,
  "postal_code" TEXT,
  "country_code" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "suppliers_code_key" UNIQUE ("code"),
  CONSTRAINT "suppliers_tax_number_key" UNIQUE ("tax_number"),
  CONSTRAINT "suppliers_code_not_blank" CHECK (BTRIM("code") <> ''),
  CONSTRAINT "suppliers_name_not_blank" CHECK (BTRIM("name") <> ''),
  CONSTRAINT "suppliers_country_code_shape" CHECK (
    "country_code" IS NULL
    OR "country_code" ~ '^[A-Z]{2}$'
  )
);

CREATE INDEX "suppliers_name_idx"
ON "suppliers"("name");

CREATE INDEX "suppliers_contact_name_idx"
ON "suppliers"("contact_name");

CREATE INDEX "suppliers_email_idx"
ON "suppliers"("email");

CREATE INDEX "suppliers_phone_idx"
ON "suppliers"("phone");

CREATE INDEX "suppliers_country_code_idx"
ON "suppliers"("country_code");

CREATE INDEX "suppliers_is_active_name_idx"
ON "suppliers"("is_active", "name");
