CREATE TABLE "customers" (
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

  CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customers_code_key" UNIQUE ("code"),
  CONSTRAINT "customers_tax_number_key" UNIQUE ("tax_number"),
  CONSTRAINT "customers_code_not_blank" CHECK (BTRIM("code") <> ''),
  CONSTRAINT "customers_name_not_blank" CHECK (BTRIM("name") <> ''),
  CONSTRAINT "customers_country_code_shape" CHECK (
    "country_code" IS NULL
    OR "country_code" ~ '^[A-Z]{2}$'
  )
);

CREATE INDEX "customers_name_idx"
ON "customers"("name");

CREATE INDEX "customers_contact_name_idx"
ON "customers"("contact_name");

CREATE INDEX "customers_email_idx"
ON "customers"("email");

CREATE INDEX "customers_phone_idx"
ON "customers"("phone");

CREATE INDEX "customers_country_code_idx"
ON "customers"("country_code");

CREATE INDEX "customers_is_active_name_idx"
ON "customers"("is_active", "name");
