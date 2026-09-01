-- ============================================================================
-- Dev Feedback Round 8: InventoryProduct.category changes from a single
-- InventoryCategory to InventoryCategory[] -- a product (e.g. a shampoo)
-- can genuinely belong to more than one category (FOR_SALE and
-- INTERNAL_USE at once) rather than being forced into exactly one.
-- Existing rows' single value is wrapped into a one-element array; no
-- data loss. Field name kept singular despite the type change, to
-- minimize churn across the DTO/service/frontend that already reference
-- `category`. No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

-- Drop the old scalar index before the column's type changes.
DROP INDEX IF EXISTS "inventory_products_category_idx";

ALTER TABLE "inventory_products"
    ALTER COLUMN "category" TYPE "InventoryCategory"[]
    USING ARRAY["category"];

-- Recreate as a GIN index -- the right index type for an array column's
-- "contains" queries (the scalar B-tree index that existed before isn't
-- useful for @> / has-element lookups against an array).
CREATE INDEX IF NOT EXISTS "inventory_products_category_idx" ON "inventory_products" USING GIN ("category");