-- ============================================================================
-- Dev Feedback Round 4, item #12: adds CANCELLED to AddressVerificationStatus.
-- Apply via `prisma migrate deploy`. Must be its own migration file --
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction with other
-- statements, same constraint as every other enum-value addition in this
-- project's migration history.
-- ============================================================================

ALTER TYPE "AddressVerificationStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';