-- ============================================================================
-- Adds lifecycle_campaign_templates -- one row per (targetLifecycle,
-- channel), admin-configurable message content, delay, and cooldown for
-- Automated Lifecycle Campaigns. No rows are seeded here; an admin
-- configures each combination they want active through the admin UI.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "lifecycle_campaign_templates" (
  "id" TEXT NOT NULL,
  "target_lifecycle" TEXT NOT NULL,
  "channel" "CommunicationChannel" NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "subject" TEXT,
  "body_template" TEXT NOT NULL,
  "delay_days" INTEGER NOT NULL DEFAULT 0,
  "cooldown_days" INTEGER NOT NULL DEFAULT 30,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lifecycle_campaign_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lifecycle_campaign_templates_target_lifecycle_channel_key"
  ON "lifecycle_campaign_templates" ("target_lifecycle", "channel");