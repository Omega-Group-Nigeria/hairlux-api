-- ============================================================================
-- Hairlux additive migration — suppliers (covers both Suppliers and Vendors,
-- distinguished by "type") plus inventory_items.supplier_id. Part of the
-- Contacts module restructure. Apply via `prisma migrate deploy`.
-- No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "SupplierType" AS ENUM ('SUPPLIER', 'VENDOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" TEXT NOT NULL,
  "type" "SupplierType" NOT NULL,
  "name" TEXT NOT NULL,
  "contact_person" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "suppliers_type_idx" ON "suppliers"("type");

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "supplier_id" TEXT;

CREATE INDEX IF NOT EXISTS "inventory_items_supplier_id_idx" ON "inventory_items"("supplier_id");

DO $$ BEGIN
  ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;