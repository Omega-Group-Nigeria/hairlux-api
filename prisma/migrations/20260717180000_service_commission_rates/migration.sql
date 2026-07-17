-- Per-service commission overrides (fallback: home_service_settings.commission_rate)
CREATE TABLE "service_commission_rates" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "commission_rate" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_commission_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_commission_rates_service_id_key" ON "service_commission_rates"("service_id");

ALTER TABLE "service_commission_rates" ADD CONSTRAINT "service_commission_rates_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
