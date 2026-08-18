-- ============================================================================
-- Adds lifecycle_campaign_sends -- one row per (transition, template) send
-- attempt, tracking outcome independently per channel/template so a
-- transition matching multiple templates (e.g. both EMAIL and SMS
-- configured for the same targetLifecycle) can have each handled on its
-- own delayDays timeline without a single flag conflating them.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "lifecycle_campaign_sends" (
  "id" TEXT NOT NULL,
  "transition_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lifecycle_campaign_sends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lifecycle_campaign_sends_transition_id_template_id_key"
  ON "lifecycle_campaign_sends" ("transition_id", "template_id");
CREATE INDEX IF NOT EXISTS "lifecycle_campaign_sends_template_id_status_idx"
  ON "lifecycle_campaign_sends" ("template_id", "status");

ALTER TABLE "lifecycle_campaign_sends"
  ADD CONSTRAINT "lifecycle_campaign_sends_transition_id_fkey"
    FOREIGN KEY ("transition_id") REFERENCES "customer_lifecycle_transitions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "lifecycle_campaign_sends_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "lifecycle_campaign_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;