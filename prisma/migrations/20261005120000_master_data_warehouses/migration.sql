ALTER TABLE "categories"
ADD COLUMN "code" TEXT;

UPDATE "categories"
SET "code" = 'CAT-' || UPPER(REPLACE("id"::text, '-', ''))
WHERE "code" IS NULL;

ALTER TABLE "categories"
ALTER COLUMN "code" SET NOT NULL;

ALTER TABLE "categories"
ADD CONSTRAINT "categories_code_key" UNIQUE ("code");

ALTER TABLE "units"
ADD COLUMN "code" TEXT;

UPDATE "units"
SET "code" = 'UNIT-' || UPPER(REPLACE("id"::text, '-', ''))
WHERE "code" IS NULL;

ALTER TABLE "units"
ALTER COLUMN "code" SET NOT NULL;

ALTER TABLE "units"
ADD CONSTRAINT "units_code_key" UNIQUE ("code");

ALTER TABLE "warehouses"
ADD COLUMN "location" TEXT;
