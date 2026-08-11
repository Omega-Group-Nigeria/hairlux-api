-- Admin-set per-beautician commission override.
-- Precedence when present: beautician override > service override > HomeServiceSettings.commissionRate.

CREATE TABLE "beautician_commission_rates" (
    "id" TEXT NOT NULL,
    "beautician_user_id" TEXT NOT NULL,
    "commission_rate" DECIMAL(5, 4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beautician_commission_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "beautician_commission_rates_beautician_user_id_key"
    ON "beautician_commission_rates"("beautician_user_id");

ALTER TABLE "beautician_commission_rates"
    ADD CONSTRAINT "beautician_commission_rates_beautician_user_id_fkey"
    FOREIGN KEY ("beautician_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
