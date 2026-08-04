-- ============================================================================
-- Hairlux additive migration — adds the DRAFT value to ApplicationStatus.
-- Split into its own migration file/transaction: PostgreSQL does not allow
-- ALTER TYPE ... ADD VALUE to safely run in the same transaction as other
-- DDL that might reference the new value, and Prisma wraps each migration
-- file in one transaction, so combining them causes the whole migration to
-- fail. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'DRAFT';