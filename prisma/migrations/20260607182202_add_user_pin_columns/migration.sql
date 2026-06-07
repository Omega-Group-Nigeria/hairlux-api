-- Safe, additive-only migration for PIN fields on users table.
-- Using IF NOT EXISTS to guarantee zero data loss / no errors on re-run.
-- This only adds columns. No drops, no enum changes, no index changes.

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "pin" TEXT,
ADD COLUMN IF NOT EXISTS "pin_set_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pin_locked_until" TIMESTAMPTZ;

-- Optional: backfill the default for existing rows (harmless)
UPDATE "users" SET "pin_failed_attempts" = 0 WHERE "pin_failed_attempts" IS NULL;
