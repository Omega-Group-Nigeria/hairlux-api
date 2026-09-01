-- ============================================================================
-- Procurement, Inventory & Finance Integration — Phase 1: Product & Vendor
-- master data. Adds InventoryProduct (the global, branch-independent
-- product master record -- NOT named "Product", that's already taken by
-- the unrelated e-commerce Shop model), VendorProduct (many-to-many
-- vendor<->product "products supplied"), extends Supplier with vendor
-- fields (banking, payment terms, performance rating, etc.), and links
-- InventoryItem to InventoryProduct via an optional, not-yet-backfilled
-- product_id FK. InventoryItem's existing behavior is otherwise
-- unchanged -- Phase 2 does the real Store/Sales/Usage split & migration.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "whatsapp" TEXT,
  ADD COLUMN IF NOT EXISTS "vendor_category" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "state" TEXT,
  ADD COLUMN IF NOT EXISTS "bank_name" TEXT,
  ADD COLUMN IF NOT EXISTS "account_number" TEXT,
  ADD COLUMN IF NOT EXISTS "verified_account_name" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_terms" TEXT,
  ADD COLUMN IF NOT EXISTS "average_delivery_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "performance_rating" DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS "is_preferred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "remarks" TEXT;

CREATE TABLE IF NOT EXISTS "inventory_products" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "brand" TEXT,
  "category" "InventoryCategory" NOT NULL,
  "product_type" TEXT,
  "unit" TEXT,
  "cost_price" DECIMAL(10,2),
  "selling_price" DECIMAL(10,2),
  "bulk_selling_price" DECIMAL(10,2),
  "min_bulk_quantity" INTEGER,
  "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
  "expiry_tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_products_sku_key" ON "inventory_products" ("sku");
CREATE INDEX IF NOT EXISTS "inventory_products_is_active_idx" ON "inventory_products" ("is_active");
CREATE INDEX IF NOT EXISTS "inventory_products_category_idx" ON "inventory_products" ("category");

CREATE TABLE IF NOT EXISTS "vendor_products" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  CONSTRAINT "vendor_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_products_vendor_id_product_id_key" ON "vendor_products" ("vendor_id", "product_id");
CREATE INDEX IF NOT EXISTS "vendor_products_product_id_idx" ON "vendor_products" ("product_id");

ALTER TABLE "vendor_products"
  ADD CONSTRAINT "vendor_products_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vendor_products_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "product_id" TEXT;

CREATE INDEX IF NOT EXISTS "inventory_items_product_id_idx" ON "inventory_items" ("product_id");

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;