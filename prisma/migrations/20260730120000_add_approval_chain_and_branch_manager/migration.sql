-- ============================================================================
-- Hairlux additive-only migration — Branch Manager link + shared Approval Chain
-- Hand-written (not via `prisma migrate dev`) for the same reason as
-- 20260728223000_recruitment_attendance_leave_inventory: the pre-existing
-- constraint/index drift on unrelated tables (users, bookings, wallets, etc.)
-- makes `migrate dev` refuse to run. Apply via `prisma migrate deploy`, which
-- only cares about pending migrations, not drift.
--
-- Every statement is either:
--   - CREATE TYPE (new enum, no conflict possible)
--   - CREATE TABLE IF NOT EXISTS (new table only)
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS (additive, nullable)
--   - ADD CONSTRAINT guarded against duplicate_object / duplicate_table
-- Nothing here drops, renames, or alters an existing column, constraint,
-- or index on any table. BACK UP FIRST regardless.
--
-- NOTE: no BEGIN/COMMIT — Prisma's migrate engine wraps every migration file
-- in its own transaction already; see the note in the previous migration file
-- for why an explicit one here caused "current transaction is aborted".
-- ============================================================================

-- ── New enum types ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ApprovalRequestType" AS ENUM ('LEAVE_REQUEST', 'INVENTORY_ADJUSTMENT', 'STOCK_TRANSFER', 'PAYROLL_ADJUSTMENT', 'COMMISSION_ADJUSTMENT', 'DISCIPLINARY_ACTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MORE_INFO_REQUESTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalActionType" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'REASSIGNED', 'MORE_INFO_REQUESTED', 'INFO_PROVIDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── staff_locations: branch manager link ────────────────────────────────────

ALTER TABLE "staff_locations"
  ADD COLUMN IF NOT EXISTS "manager_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "staff_locations"
    ADD CONSTRAINT "staff_locations_manager_id_key" UNIQUE ("manager_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_locations"
    ADD CONSTRAINT "staff_locations_manager_id_fkey"
    FOREIGN KEY ("manager_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── approval_requests (new table) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" TEXT NOT NULL,
  "request_type" "ApprovalRequestType" NOT NULL,
  "branch_id" TEXT,
  "submitted_by_id" TEXT NOT NULL,
  "current_approver_id" TEXT,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "approval_requests_current_approver_id_status_idx" ON "approval_requests"("current_approver_id", "status");
CREATE INDEX IF NOT EXISTS "approval_requests_request_type_status_idx" ON "approval_requests"("request_type", "status");

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_submitted_by_id_fkey"
    FOREIGN KEY ("submitted_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_current_approver_id_fkey"
    FOREIGN KEY ("current_approver_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── approval_actions (new table) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "approval_actions" (
  "id" TEXT NOT NULL,
  "approval_request_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "action" "ApprovalActionType" NOT NULL,
  "from_approver_id" TEXT,
  "to_approver_id" TEXT,
  "comment" TEXT,
  "acted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "approval_actions_approval_request_id_idx" ON "approval_actions"("approval_request_id");

DO $$ BEGIN
  ALTER TABLE "approval_actions"
    ADD CONSTRAINT "approval_actions_approval_request_id_fkey"
    FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "approval_actions"
    ADD CONSTRAINT "approval_actions_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── leave_requests: link to approval_requests ───────────────────────────────

ALTER TABLE "leave_requests"
  ADD COLUMN IF NOT EXISTS "approval_request_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_approval_request_id_key" UNIQUE ("approval_request_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_approval_request_id_fkey"
    FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;