-- Restore the unique index on refresh_tokens.token if it was dropped.
-- The ON CONFLICT clause in upsert requires this constraint to exist.
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_key" ON "refresh_tokens"("token");