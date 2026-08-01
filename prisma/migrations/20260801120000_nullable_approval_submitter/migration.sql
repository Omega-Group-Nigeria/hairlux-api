-- ============================================================================
-- Hairlux additive migration — makes approval_requests.submitted_by_id
-- nullable, same "null = admin-initiated with no linked staff record"
-- convention as the earlier nullable-audit-fields migration. Fixes a
-- compile error where requestStockAdjustment (now accepting an optional
-- staffId for admin-elevated actions) couldn't satisfy this previously
-- required field. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "approval_requests" ALTER COLUMN "submitted_by_id" DROP NOT NULL;