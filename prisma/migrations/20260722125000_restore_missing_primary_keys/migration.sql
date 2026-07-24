-- Restores primary keys that are missing on 18 tables in this database.
-- Root cause: every affected table was originally created with
-- `CREATE TABLE IF NOT EXISTS`, and at some point in this database's
-- history a table of the same name already existed (schema drift from
-- however this environment was populated) — so the CREATE TABLE statement,
-- inline PRIMARY KEY constraint included, was silently skipped entirely.
-- The columns and data are intact; only the constraint is missing.
--
-- Verified via duplicate-id check before writing this migration — all 17
-- affected tables (18 including staff, checked earlier) have zero duplicate
-- id values, so adding these constraints is safe.
--
-- Each ADD CONSTRAINT is wrapped defensively so this migration is safely
-- re-runnable if a table already has its key restored by some other means
-- before this runs.

DO $$ BEGIN
  ALTER TABLE "staff" ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "business_exceptions" ADD CONSTRAINT "business_exceptions_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "influencer_reward_settings" ADD CONSTRAINT "influencer_reward_settings_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "influencer_rewards" ADD CONSTRAINT "influencer_rewards_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_campaign_code_usages" ADD CONSTRAINT "referral_campaign_code_usages_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_settings" ADD CONSTRAINT "referral_settings_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referrals" ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_employment_history" ADD CONSTRAINT "staff_employment_history_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN invalid_table_definition THEN null; END $$;

-- Also restore staff_employment_history's FK to staff — confirmed missing
-- earlier via direct query, same root cause (CREATE TABLE IF NOT EXISTS
-- skipped it entirely). Must come after staff regains its primary key above.
DO $$ BEGIN
  ALTER TABLE "staff_employment_history"
    ADD CONSTRAINT "staff_employment_history_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;