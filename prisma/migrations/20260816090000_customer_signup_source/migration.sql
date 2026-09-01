-- ============================================================================
-- Hairlux additive migration — CRM & Retention Engine: tracks Web vs App as
-- the two Customer Source values distinct from walk-in (per spec, only 3
-- acquisition sources: WEB, APP, WALK-IN — walk-in is inherent to the
-- Customer model and never touches this column). Nullable: existing rows
-- predate this tracking. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "CustomerSignupSource" AS ENUM ('WEB', 'APP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "signup_source" "CustomerSignupSource";