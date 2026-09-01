-- ============================================================================
-- Procurement/Inventory/Finance Integration, Phase 6: service-to-inventory
-- automation. A service's product "recipe" -- keyed to InventoryProduct
-- (branch-independent), resolved to a specific branch's InventoryItem at
-- completion time. No BEGIN/COMMIT, matching this project's migration
-- history.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "service_product_consumption" (
  "id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "service_product_consumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_product_consumption_service_id_product_id_key" ON "service_product_consumption" ("service_id", "product_id");
CREATE INDEX IF NOT EXISTS "service_product_consumption_product_id_idx" ON "service_product_consumption" ("product_id");

ALTER TABLE "service_product_consumption"
  ADD CONSTRAINT "service_product_consumption_service_id_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_product_consumption_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;