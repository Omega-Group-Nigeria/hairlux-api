-- ============================================================================
-- Dev Feedback Round 6, item #12: two optional, independent audience-
-- narrowing filters on Lifecycle Campaign Templates -- targetValue
-- (Standard/Premium/VIP) and audienceSource (User/Customer Contacts).
-- Both nullable -- null means "no restriction on this dimension", same
-- convention already used by send_hour meaning "no time restriction".
-- No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

ALTER TABLE "lifecycle_campaign_templates" ADD COLUMN IF NOT EXISTS "target_value" TEXT;
ALTER TABLE "lifecycle_campaign_templates" ADD COLUMN IF NOT EXISTS "audience_source" TEXT;