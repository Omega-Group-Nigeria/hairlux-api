-- ============================================================================
-- Dev Feedback Round 4, item #47: generic, system-wide audit log for
-- sensitive actions outside payroll and roles/permissions.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "system_audit_logs" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "staff_id" TEXT,
  "actor_id" TEXT,
  "note" TEXT,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "system_audit_logs_entity_type_entity_id_idx" ON "system_audit_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "system_audit_logs_actor_id_idx" ON "system_audit_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "system_audit_logs_staff_id_idx" ON "system_audit_logs" ("staff_id");
CREATE INDEX IF NOT EXISTS "system_audit_logs_created_at_idx" ON "system_audit_logs" ("created_at");

ALTER TABLE "system_audit_logs"
  ADD CONSTRAINT "system_audit_logs_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "system_audit_logs_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;