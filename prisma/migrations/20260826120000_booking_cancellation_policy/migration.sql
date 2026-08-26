-- Booking cancellation policy rules (admin-configurable per category/scenario).
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.

CREATE TYPE "BookingCancellationPolicyCategory" AS ENUM ('WALK_IN_BRANCH', 'HOME_SERVICE');

CREATE TYPE "CancellationPolicyScenario" AS ENUM (
  'WITHIN_CANCELLATION_WINDOW',
  'OUTSIDE_CANCELLATION_WINDOW',
  'GRACE_PERIOD',
  'AFTER_GRACE_PERIOD',
  'DISPATCHED',
  'NO_SHOW',
  'ADMIN_CANCELLATION'
);

CREATE TABLE IF NOT EXISTS "booking_cancellation_policy_rules" (
  "id" TEXT NOT NULL,
  "category" "BookingCancellationPolicyCategory" NOT NULL,
  "scenario" "CancellationPolicyScenario" NOT NULL,
  "window_minutes" INTEGER,
  "refund_percent" INTEGER NOT NULL DEFAULT 0,
  "forfeiture_percent" INTEGER NOT NULL DEFAULT 0,
  "customer_can_cancel" BOOLEAN NOT NULL DEFAULT false,
  "admin_can_cancel" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "booking_cancellation_policy_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_cancellation_policy_rules_category_scenario_key"
  ON "booking_cancellation_policy_rules"("category", "scenario");

-- Walk-in / branch defaults
INSERT INTO "booking_cancellation_policy_rules" (
  "id", "category", "scenario", "window_minutes",
  "refund_percent", "forfeiture_percent", "customer_can_cancel", "admin_can_cancel", "updated_at"
)
SELECT * FROM (VALUES
  ('bcp-walk-in-within-window', 'WALK_IN_BRANCH'::"BookingCancellationPolicyCategory", 'WITHIN_CANCELLATION_WINDOW'::"CancellationPolicyScenario", 120, 100, 0, true, true, NOW()),
  ('bcp-walk-in-outside-window', 'WALK_IN_BRANCH'::"BookingCancellationPolicyCategory", 'OUTSIDE_CANCELLATION_WINDOW'::"CancellationPolicyScenario", NULL, 0, 100, false, true, NOW()),
  ('bcp-walk-in-no-show', 'WALK_IN_BRANCH'::"BookingCancellationPolicyCategory", 'NO_SHOW'::"CancellationPolicyScenario", NULL, 50, 50, false, true, NOW()),
  ('bcp-walk-in-admin', 'WALK_IN_BRANCH'::"BookingCancellationPolicyCategory", 'ADMIN_CANCELLATION'::"CancellationPolicyScenario", NULL, 100, 0, false, true, NOW())
) AS v("id", "category", "scenario", "window_minutes", "refund_percent", "forfeiture_percent", "customer_can_cancel", "admin_can_cancel", "updated_at")
WHERE NOT EXISTS (
  SELECT 1 FROM "booking_cancellation_policy_rules" WHERE "category" = 'WALK_IN_BRANCH'
);

-- Home / mobile service defaults
INSERT INTO "booking_cancellation_policy_rules" (
  "id", "category", "scenario", "window_minutes",
  "refund_percent", "forfeiture_percent", "customer_can_cancel", "admin_can_cancel", "updated_at"
)
SELECT * FROM (VALUES
  ('bcp-home-grace', 'HOME_SERVICE'::"BookingCancellationPolicyCategory", 'GRACE_PERIOD'::"CancellationPolicyScenario", 5, 100, 0, true, true, NOW()),
  ('bcp-home-after-grace', 'HOME_SERVICE'::"BookingCancellationPolicyCategory", 'AFTER_GRACE_PERIOD'::"CancellationPolicyScenario", NULL, 0, 100, false, true, NOW()),
  ('bcp-home-dispatched', 'HOME_SERVICE'::"BookingCancellationPolicyCategory", 'DISPATCHED'::"CancellationPolicyScenario", NULL, 40, 60, false, true, NOW()),
  ('bcp-home-no-show', 'HOME_SERVICE'::"BookingCancellationPolicyCategory", 'NO_SHOW'::"CancellationPolicyScenario", NULL, 40, 60, false, true, NOW()),
  ('bcp-home-admin', 'HOME_SERVICE'::"BookingCancellationPolicyCategory", 'ADMIN_CANCELLATION'::"CancellationPolicyScenario", NULL, 100, 0, false, true, NOW())
) AS v("id", "category", "scenario", "window_minutes", "refund_percent", "forfeiture_percent", "customer_can_cancel", "admin_can_cancel", "updated_at")
WHERE NOT EXISTS (
  SELECT 1 FROM "booking_cancellation_policy_rules" WHERE "category" = 'HOME_SERVICE'
);
