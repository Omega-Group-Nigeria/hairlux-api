-- ============================================================================
-- Hairlux additive migration — Roles & Permissions Part A gaps: multi-role
-- support (a secondary-roles join table on top of the existing single
-- User.adminRoleId, kept rather than replacing it since a lot of existing
-- code reads that FK directly) and a dedicated audit trail for every role
-- and permission change. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "RoleAuditAction" AS ENUM (
    'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED', 'PERMISSIONS_CHANGED',
    'USER_ROLE_ASSIGNED', 'USER_ROLE_ADDED', 'USER_ROLE_REMOVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Defensive: admin_roles.id should already carry a primary key from its
-- original migration (20260303121516_add_admin_roles_permissions), but the
-- foreign keys below fail outright if it's missing for any reason on a
-- given database — cheap to guarantee it's there rather than assume.
DO $$ BEGIN
  ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Secondary roles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_admin_roles" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "admin_role_id" TEXT NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_by_id" TEXT,
  CONSTRAINT "user_admin_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_admin_roles_user_id_admin_role_id_key" ON "user_admin_roles"("user_id", "admin_role_id");
CREATE INDEX IF NOT EXISTS "user_admin_roles_user_id_idx" ON "user_admin_roles"("user_id");

DO $$ BEGIN
  ALTER TABLE "user_admin_roles" ADD CONSTRAINT "user_admin_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user_admin_roles" ADD CONSTRAINT "user_admin_roles_admin_role_id_fkey" FOREIGN KEY ("admin_role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user_admin_roles" ADD CONSTRAINT "user_admin_roles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Audit trail ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "role_audit_logs" (
  "id" TEXT NOT NULL,
  "action" "RoleAuditAction" NOT NULL,
  "admin_role_id" TEXT,
  "role_name" TEXT NOT NULL,
  "target_user_id" TEXT,
  "actor_id" TEXT,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "role_audit_logs_admin_role_id_idx" ON "role_audit_logs"("admin_role_id");
CREATE INDEX IF NOT EXISTS "role_audit_logs_target_user_id_idx" ON "role_audit_logs"("target_user_id");
CREATE INDEX IF NOT EXISTS "role_audit_logs_created_at_idx" ON "role_audit_logs"("created_at");

DO $$ BEGIN
  ALTER TABLE "role_audit_logs" ADD CONSTRAINT "role_audit_logs_admin_role_id_fkey" FOREIGN KEY ("admin_role_id") REFERENCES "admin_roles"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "role_audit_logs" ADD CONSTRAINT "role_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "role_audit_logs" ADD CONSTRAINT "role_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;