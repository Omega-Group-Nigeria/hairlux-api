-- ============================================================================
-- Hairlux additive migration — makes stock_adjustment_requests.requested_by_id
-- and stock_movements.performed_by_id nullable, matching the existing
-- "null = system/admin-initiated" convention already used on
-- approval_actions.actor_id. Fixes admin-elevated inventory actions (adjust,
-- approve/reject/reassign, and salon booking complete/create) failing with
-- "No staff record linked to this account" whenever the acting admin has no
-- linked Staff record. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "stock_adjustment_requests" ALTER COLUMN "requested_by_id" DROP NOT NULL;
ALTER TABLE "stock_movements" ALTER COLUMN "performed_by_id" DROP NOT NULL;