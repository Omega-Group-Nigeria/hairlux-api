-- Add per-user active session binding to enforce single concurrent session
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "current_session_id" TEXT;
