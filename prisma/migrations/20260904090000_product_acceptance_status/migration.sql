-- ============================================================================
-- Dev Feedback Round 9: "Product Acceptance" -- splits what used to be one
-- single action (recording a delivery AND deciding how much of it to
-- accept into inventory, at the same time) into two genuinely separate
-- steps: Receive Goods (just records what physically arrived) and the
-- new Accept Products action (reviews it and credits inventory).
--
-- 1. New ProductAcceptanceStatus enum + purchases.acceptance_status,
--    distinct from purchases.status's own delivery-tracking states.
-- 2. accepted_at/accepted_by_id added to goods_receipt_lines -- a null
--    accepted_at is what "still needs review" means from now on.
-- 3. Backfill for existing data: every goods_receipt_line that already
--    exists was created under the OLD single-step flow, where receiving
--    and accepting were the same action and inventory was already
--    credited at that moment -- so these are backfilled as already
--    reviewed (accepted_at = the receipt's own received_date, accepted_by
--    = whoever received it, the closest available approximation of who
--    accepted it under the old combined flow) rather than surfacing a
--    sudden backlog of "pending acceptance" for delivery events that, in
--    every practical sense, were already accepted months ago.
--
-- No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE "ProductAcceptanceStatus" AS ENUM ('PENDING', 'RECEIVED', 'FULLY_ACCEPTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "acceptance_status" "ProductAcceptanceStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP(3);
ALTER TABLE "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "accepted_by_id" TEXT;

DO $$ BEGIN
    ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_accepted_by_id_fkey"
        FOREIGN KEY ("accepted_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Backfill existing receipt lines as already-reviewed under the old
-- combined flow.
UPDATE "goods_receipt_lines" grl
SET "accepted_at" = gr."received_date",
    "accepted_by_id" = gr."received_by_id"
FROM "goods_receipts" gr
WHERE grl."goods_receipt_id" = gr."id"
  AND grl."accepted_at" IS NULL;

-- Backfill purchases.acceptance_status: FULLY_ACCEPTED for anything that
-- already has at least one goods receipt (all of which are now backfilled
-- as reviewed above), PENDING otherwise.
UPDATE "purchases" p
SET "acceptance_status" = 'FULLY_ACCEPTED'
WHERE EXISTS (SELECT 1 FROM "goods_receipts" gr WHERE gr."purchase_id" = p."id");