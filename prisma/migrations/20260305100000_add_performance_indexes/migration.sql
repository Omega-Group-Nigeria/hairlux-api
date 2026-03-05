-- CreateIndex: Users - role and status filters
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex: RefreshTokens - lookup by user
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex: Addresses - lookup by user
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex: Bookings - most queried fields
CREATE INDEX "bookings_user_id_idx" ON "bookings"("user_id");
CREATE INDEX "bookings_status_idx" ON "bookings"("status");
CREATE INDEX "bookings_booking_date_idx" ON "bookings"("booking_date");
CREATE INDEX "bookings_user_id_status_idx" ON "bookings"("user_id", "status");

-- CreateIndex: Transactions - lookup by wallet and status
CREATE INDEX "transactions_wallet_id_idx" ON "transactions"("wallet_id");
CREATE INDEX "transactions_wallet_id_status_idx" ON "transactions"("wallet_id", "status");

-- CreateIndex: Reviews - lookup by user, service and status
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");
CREATE INDEX "reviews_service_id_idx" ON "reviews"("service_id");
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex: Referrals - lookup by referrer and filter by status
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");
