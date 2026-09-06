-- ============================================================================
-- Dev Feedback Round 9: allow one manager to oversee multiple branches.
-- Previously staff_locations.manager_id carried a UNIQUE constraint,
-- enforcing "at most one branch per manager" -- a staff member could be
-- the designated manager of only a single StaffLocation at a time.
-- Dropping that constraint is the entire structural change: a branch
-- still has exactly one manager_id (that FK stays single-valued), but
-- the same Staff.id can now appear as manager_id on several different
-- staff_locations rows.
--
-- No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

ALTER TABLE "staff_locations" DROP CONSTRAINT IF EXISTS "staff_locations_manager_id_key";