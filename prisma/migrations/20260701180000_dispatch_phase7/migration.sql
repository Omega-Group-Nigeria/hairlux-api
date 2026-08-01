ALTER TABLE "beautician_profiles"
ADD COLUMN "dispatch_suspended" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "beautician_profiles_dispatch_suspended_idx"
ON "beautician_profiles" ("dispatch_suspended");