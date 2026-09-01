-- ============================================================================
-- Dev Feedback Round 6, item #13: a sequence step now selects an
-- existing LifecycleCampaignTemplate rather than re-entering channel/
-- subject/message per step. channel and body_template are relaxed to
-- nullable rather than dropped -- any pre-existing step rows keep a
-- valid shape; the DTO requires template_id for every step going
-- forward. No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

ALTER TABLE "lifecycle_campaign_sequence_steps" ADD COLUMN IF NOT EXISTS "template_id" TEXT;
ALTER TABLE "lifecycle_campaign_sequence_steps" ALTER COLUMN "channel" DROP NOT NULL;
ALTER TABLE "lifecycle_campaign_sequence_steps" ALTER COLUMN "body_template" DROP NOT NULL;

ALTER TABLE "lifecycle_campaign_sequence_steps"
  ADD CONSTRAINT "lifecycle_campaign_sequence_steps_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "lifecycle_campaign_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;