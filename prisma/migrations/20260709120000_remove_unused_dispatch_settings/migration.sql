-- Remove unused home-service offer timeout (dispatch uses per-tier offerTtlSeconds).
ALTER TABLE "home_service_settings" DROP COLUMN IF EXISTS "job_offer_timeout_minutes";

-- Remove obsolete decline cooldown (declines are permanently excluded per booking).
DELETE FROM "dispatch_config" WHERE "key" = 'rejection_cooldown_seconds';