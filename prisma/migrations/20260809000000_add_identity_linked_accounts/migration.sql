-- Introduce identity-linked accounts: one person may hold multiple role-scoped
-- accounts (e.g. a USER account + a BEAUTICIAN account) sharing one email.
-- Email is no longer globally unique; uniqueness is now per (email, role) and
-- `identity_group_id` links accounts that belong to the same person.

-- Drop the old global email uniqueness constraint (may not exist on some envs).
DROP INDEX IF EXISTS "users_email_key";

-- Add the identity group link column.
ALTER TABLE "users" ADD COLUMN "identity_group_id" TEXT;

-- Backfill: every existing account is its own standalone identity group.
-- Using a deterministic value per row so linked accounts can later be merged.
UPDATE "users" SET "identity_group_id" = "id" WHERE "identity_group_id" IS NULL;

-- Enforce one account per (email, role).
CREATE UNIQUE INDEX "users_email_role_key" ON "users"("email", "role");

-- Speed up email and identity lookups.
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_identity_group_id_idx" ON "users"("identity_group_id");

-- All accounts now have a non-null identity group.
ALTER TABLE "users" ALTER COLUMN "identity_group_id" SET NOT NULL;