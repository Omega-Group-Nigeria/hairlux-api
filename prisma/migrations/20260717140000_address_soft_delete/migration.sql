-- Soft delete for saved addresses (keep rows for booking/shop FKs)
ALTER TABLE "addresses" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "addresses_user_id_deleted_at_idx" ON "addresses"("user_id", "deleted_at");
