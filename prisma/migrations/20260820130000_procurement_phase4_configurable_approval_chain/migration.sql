-- ============================================================================
-- Procurement, Inventory & Finance Integration — Phase 4a: configurable,
-- role-based approval chains. Strictly additive to the existing shared
-- approval engine (already used by Leave/Inventory Adjustment/Stock
-- Transfer) -- every new column is nullable, and a request type with no
-- configured ApprovalChainStage rows keeps the original single-approver
-- behavior completely unchanged. Only PURCHASE_REQUEST (once an admin
-- configures stages for it) gets routed by role instead of by person.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "current_stage_order" INTEGER,
  ADD COLUMN IF NOT EXISTS "current_stage_role_id" TEXT;

CREATE INDEX IF NOT EXISTS "approval_requests_current_stage_role_id_status_idx" ON "approval_requests" ("current_stage_role_id", "status");

ALTER TABLE "approval_requests"
  ADD CONSTRAINT "approval_requests_current_stage_role_id_fkey"
    FOREIGN KEY ("current_stage_role_id") REFERENCES "admin_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "approval_chain_stages" (
  "id" TEXT NOT NULL,
  "request_type" "ApprovalRequestType" NOT NULL,
  "stage_order" INTEGER NOT NULL,
  "approver_role_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_chain_stages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_chain_stages_request_type_stage_order_key" ON "approval_chain_stages" ("request_type", "stage_order");
CREATE INDEX IF NOT EXISTS "approval_chain_stages_request_type_idx" ON "approval_chain_stages" ("request_type");

ALTER TABLE "approval_chain_stages"
  ADD CONSTRAINT "approval_chain_stages_approver_role_id_fkey"
    FOREIGN KEY ("approver_role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;