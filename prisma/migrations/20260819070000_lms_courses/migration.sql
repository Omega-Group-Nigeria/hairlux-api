-- ============================================================================
-- Adds lms_courses and lms_course_roles -- the Learning Management System
-- (staff training) feature. Pure, one-way, role-gated content library:
-- admin uploads video/PDF/rich-text, staff can only view. No progress or
-- completion tracking anywhere, per product decision. Access is gated by
-- AdminRole (the RBAC permission-set role), checked against a staff
-- member's EFFECTIVE roles (primary + every secondary UserAdminRole).
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- NOTE: cannot apply until the currently-failed
-- 20260815120000_business_hours_unique_constraint migration is resolved --
-- Prisma refuses all further migrations while one is stuck.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "lms_courses" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "video_key" TEXT,
  "pdf_key" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lms_courses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lms_courses_is_active_idx" ON "lms_courses" ("is_active");

ALTER TABLE "lms_courses"
  ADD CONSTRAINT "lms_courses_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "lms_course_roles" (
  "id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "admin_role_id" TEXT NOT NULL,
  CONSTRAINT "lms_course_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lms_course_roles_course_id_admin_role_id_key" ON "lms_course_roles" ("course_id", "admin_role_id");
CREATE INDEX IF NOT EXISTS "lms_course_roles_admin_role_id_idx" ON "lms_course_roles" ("admin_role_id");

ALTER TABLE "lms_course_roles"
  ADD CONSTRAINT "lms_course_roles_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "lms_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "lms_course_roles_admin_role_id_fkey"
    FOREIGN KEY ("admin_role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;