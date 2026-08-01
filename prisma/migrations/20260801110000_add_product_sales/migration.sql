-- ============================================================================
-- Hairlux additive migration — product_sales / product_sale_items, a
-- standalone retail-sale system for FOR_SALE inventory items with no
-- service attached (distinct from SalonBooking's products-used lines).
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "product_sales" (
  "id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "sold_by_id" TEXT,
  "customer_name" TEXT,
  "customer_phone" TEXT,
  "total_amount" DECIMAL(10,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "product_sale_items" (
  "id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "product_sale_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "product_sales_branch_id_created_at_idx" ON "product_sales"("branch_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_sold_by_id_fkey" FOREIGN KEY ("sold_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_sale_items" ADD CONSTRAINT "product_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "product_sales"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "product_sale_items" ADD CONSTRAINT "product_sale_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;