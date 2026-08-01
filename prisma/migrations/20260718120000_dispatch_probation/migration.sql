-- Timed dispatch probation (auto-unsuspend)
ALTER TABLE "beautician_profiles"
ADD COLUMN "dispatch_suspended_until" TIMESTAMP(3),
ADD COLUMN "dispatch_suspension_reason" TEXT;

CREATE INDEX "beautician_profiles_dispatch_suspended_until_idx"
ON "beautician_profiles"("dispatch_suspended_until");
