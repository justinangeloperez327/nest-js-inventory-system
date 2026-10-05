CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "cost_price" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "selling_price" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "minimum_stock" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "reorder_point" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "maximum_stock" DECIMAL(19,4),
    "is_trackable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quantity_on_hand" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "quantity_reserved" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_items_nonnegative_reserved" CHECK ("quantity_reserved" >= 0)
);

CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");
CREATE UNIQUE INDEX "units_symbol_key" ON "units"("symbol");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
CREATE INDEX "products_category_id_idx" ON "products"("category_id");
CREATE INDEX "products_unit_id_idx" ON "products"("unit_id");
CREATE INDEX "products_name_idx" ON "products"("name");
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");
CREATE INDEX "warehouses_name_idx" ON "warehouses"("name");
CREATE UNIQUE INDEX "inventory_items_product_id_warehouse_id_key" ON "inventory_items"("product_id", "warehouse_id");
CREATE INDEX "inventory_items_warehouse_id_idx" ON "inventory_items"("warehouse_id");
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

ALTER TABLE "user_roles"
ADD CONSTRAINT "user_roles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles"
ADD CONSTRAINT "user_roles_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
ADD CONSTRAINT "role_permissions_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
ADD CONSTRAINT "role_permissions_permission_id_fkey"
FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products"
ADD CONSTRAINT "products_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products"
ADD CONSTRAINT "products_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_items"
ADD CONSTRAINT "inventory_items_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_items"
ADD CONSTRAINT "inventory_items_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
