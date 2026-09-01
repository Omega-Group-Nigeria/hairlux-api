-- ============================================================================
-- Procurement/Inventory/Finance Integration, Phase 8: cost-basis snapshot
-- so COGS/Gross Profit can actually be computed. Both nullable -- historical
-- rows have nothing to backfill accurately, and InventoryItem.productId
-- (the source for cost) is itself optional. No BEGIN/COMMIT, matching this
-- project's migration history.
-- ============================================================================

ALTER TABLE "product_sale_items" ADD COLUMN IF NOT EXISTS "unit_cost" DECIMAL(10,2);
ALTER TABLE "salon_booking_inventory_items" ADD COLUMN IF NOT EXISTS "unit_cost" DECIMAL(10,2);