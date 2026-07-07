-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN "order_code" TEXT;

-- Backfill existing rows
UPDATE "shop_orders"
SET "order_code" = 'HLORDER-' || upper(substring(md5(id::text || random()::text) for 5))
WHERE "order_code" IS NULL;

-- Enforce NOT NULL and uniqueness
ALTER TABLE "shop_orders" ALTER COLUMN "order_code" SET NOT NULL;

CREATE UNIQUE INDEX "shop_orders_order_code_key" ON "shop_orders"("order_code");