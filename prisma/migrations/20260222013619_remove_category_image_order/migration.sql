/*
  Warnings:

  - You are about to drop the column `display_order` on the `service_categories` table. All the data in the column will be lost.
  - You are about to drop the column `image_url` on the `service_categories` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "service_categories" DROP COLUMN "display_order",
DROP COLUMN "image_url";
