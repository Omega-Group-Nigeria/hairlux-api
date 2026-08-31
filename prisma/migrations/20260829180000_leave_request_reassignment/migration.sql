-- ============================================================================
-- Dev Feedback Round 6, item #22: the "Reassign" feature was already
-- wired up on the frontend (dropdown, reason field, PATCH .../reassign
-- call) but had no backend endpoint or service logic at all. approver_id
-- is overwritten on reassign (matches its existing "current approver"
-- semantics) -- these three columns track the fact and reason of the
-- most recent reassignment, not a full history log.
-- No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "reassignment_reason" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "reassigned_at" TIMESTAMP(3);
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "reassigned_by_id" TEXT;

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_reassigned_by_id_fkey"
    FOREIGN KEY ("reassigned_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;