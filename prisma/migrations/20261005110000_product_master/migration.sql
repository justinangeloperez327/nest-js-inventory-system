ALTER TABLE "products"
DROP CONSTRAINT "products_category_id_fkey";

ALTER TABLE "products"
DROP CONSTRAINT "products_unit_id_fkey";

ALTER TABLE "products"
ALTER COLUMN "category_id" DROP NOT NULL,
ALTER COLUMN "unit_id" DROP NOT NULL;

ALTER TABLE "products"
ADD CONSTRAINT "products_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products"
ADD CONSTRAINT "products_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
