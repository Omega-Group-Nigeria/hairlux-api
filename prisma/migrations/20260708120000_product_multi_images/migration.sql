-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- Migrate existing single product images
INSERT INTO "product_images" ("id", "product_id", "url", "public_id", "sort_order", "created_at")
SELECT
    md5("id" || ':image')::text,
    "id",
    "image_url",
    "image_public_id",
    0,
    "created_at"
FROM "products"
WHERE "image_url" IS NOT NULL
  AND "image_public_id" IS NOT NULL;

-- Drop legacy single-image columns
ALTER TABLE "products" DROP COLUMN "image_url";
ALTER TABLE "products" DROP COLUMN "image_public_id";

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;