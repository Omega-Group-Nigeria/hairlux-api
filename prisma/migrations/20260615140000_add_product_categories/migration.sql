-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

-- Seed default category for existing products
INSERT INTO "product_categories" ("id", "name", "description", "created_at", "updated_at")
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'General',
    'Default product category',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "products" ADD COLUMN "category_id" TEXT;

UPDATE "products"
SET "category_id" = '00000000-0000-4000-8000-000000000001'
WHERE "category_id" IS NULL;

ALTER TABLE "products" ALTER COLUMN "category_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;