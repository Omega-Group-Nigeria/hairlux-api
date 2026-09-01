-- ============================================================================
-- Dev Feedback Round 4, item #10: coupon targeting on discount_codes --
-- branch, lifecycle stage, value tier, and gating to recipients of a
-- specific lifecycle campaign template/sequence. Every new column
-- defaults to empty/null (no restriction), so every existing coupon
-- behaves exactly as before this migration applies.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "discount_codes"
  ADD COLUMN IF NOT EXISTS "target_branch_ids" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "target_lifecycle_stages" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "target_value_tiers" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "target_campaign_template_id" TEXT,
  ADD COLUMN IF NOT EXISTS "target_campaign_sequence_id" TEXT;

CREATE INDEX IF NOT EXISTS "discount_codes_target_campaign_template_id_idx" ON "discount_codes" ("target_campaign_template_id");
CREATE INDEX IF NOT EXISTS "discount_codes_target_campaign_sequence_id_idx" ON "discount_codes" ("target_campaign_sequence_id");

ALTER TABLE "discount_codes"
  ADD CONSTRAINT "discount_codes_target_campaign_template_id_fkey"
    FOREIGN KEY ("target_campaign_template_id") REFERENCES "lifecycle_campaign_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "discount_codes_target_campaign_sequence_id_fkey"
    FOREIGN KEY ("target_campaign_sequence_id") REFERENCES "lifecycle_campaign_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE;