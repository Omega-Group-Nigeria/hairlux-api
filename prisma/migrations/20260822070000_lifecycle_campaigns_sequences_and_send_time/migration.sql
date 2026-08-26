-- ============================================================================
-- Dev Feedback Round 4, items #8-9: send-time (hour/minute) on existing
-- campaign templates, and a new, additive multi-step Sequence system
-- (Email -> SMS -> Push with inter-step delays) alongside the existing,
-- untouched LifecycleCampaignTemplate/LifecycleCampaignSend tables.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "lifecycle_campaign_templates"
  ADD COLUMN IF NOT EXISTS "send_hour" INTEGER,
  ADD COLUMN IF NOT EXISTS "send_minute" INTEGER;

CREATE TABLE IF NOT EXISTS "lifecycle_campaign_sequences" (
  "id" TEXT NOT NULL,
  "target_lifecycle" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "cooldown_days" INTEGER NOT NULL DEFAULT 30,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lifecycle_campaign_sequences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lifecycle_campaign_sequences_target_lifecycle_is_enabled_idx" ON "lifecycle_campaign_sequences" ("target_lifecycle", "is_enabled");

CREATE TABLE IF NOT EXISTS "lifecycle_campaign_sequence_steps" (
  "id" TEXT NOT NULL,
  "sequence_id" TEXT NOT NULL,
  "step_order" INTEGER NOT NULL,
  "channel" "CommunicationChannel" NOT NULL,
  "subject" TEXT,
  "body_template" TEXT NOT NULL,
  "delay_after_previous_minutes" INTEGER NOT NULL DEFAULT 0,
  "send_hour" INTEGER,
  "send_minute" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lifecycle_campaign_sequence_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lifecycle_campaign_sequence_steps_sequence_id_step_order_key" ON "lifecycle_campaign_sequence_steps" ("sequence_id", "step_order");

ALTER TABLE "lifecycle_campaign_sequence_steps"
  ADD CONSTRAINT "lifecycle_campaign_sequence_steps_sequence_id_fkey"
    FOREIGN KEY ("sequence_id") REFERENCES "lifecycle_campaign_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "lifecycle_campaign_sequence_sends" (
  "id" TEXT NOT NULL,
  "transition_id" TEXT NOT NULL,
  "sequence_id" TEXT NOT NULL,
  "step_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lifecycle_campaign_sequence_sends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lifecycle_campaign_sequence_sends_transition_id_step_id_key" ON "lifecycle_campaign_sequence_sends" ("transition_id", "step_id");
CREATE INDEX IF NOT EXISTS "lifecycle_campaign_sequence_sends_step_id_status_idx" ON "lifecycle_campaign_sequence_sends" ("step_id", "status");

ALTER TABLE "lifecycle_campaign_sequence_sends"
  ADD CONSTRAINT "lifecycle_campaign_sequence_sends_transition_id_fkey"
    FOREIGN KEY ("transition_id") REFERENCES "customer_lifecycle_transitions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "lifecycle_campaign_sequence_sends_sequence_id_fkey"
    FOREIGN KEY ("sequence_id") REFERENCES "lifecycle_campaign_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "lifecycle_campaign_sequence_sends_step_id_fkey"
    FOREIGN KEY ("step_id") REFERENCES "lifecycle_campaign_sequence_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;