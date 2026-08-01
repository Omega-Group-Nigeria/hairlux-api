-- Phase 3: ops-tunable dispatch_config

CREATE TABLE "dispatch_config" (
  "id" TEXT NOT NULL,
  "region" TEXT NOT NULL DEFAULT 'default',
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "value_type" TEXT NOT NULL DEFAULT 'string',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dispatch_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatch_config_region_key_key"
  ON "dispatch_config"("region", "key");