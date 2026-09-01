-- ============================================================================
-- Adds PHYSICAL_ADDRESS_VERIFICATION as its own OnboardingItemType value,
-- separate from the existing, universal ADDRESS_VERIFICATION. Must be its
-- own migration file per this project's ALTER TYPE ... ADD VALUE
-- constraint.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TYPE "OnboardingItemType" ADD VALUE IF NOT EXISTS 'PHYSICAL_ADDRESS_VERIFICATION';