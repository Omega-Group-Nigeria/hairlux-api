-- Backfill: mark all existing PENDING influencer rewards as REWARDED
UPDATE "influencer_rewards"
SET    "status"     = 'REWARDED',
       "updated_at" = NOW()
WHERE  "status" = 'PENDING';

-- Backfill: process existing PENDING referrals using current reward settings
DO $$
DECLARE
  v_settings        RECORD;
  v_referral        RECORD;
  v_wallet_id       UUID;
  v_reward_amount   NUMERIC(10,2);
BEGIN
  -- Load the active reward settings (only proceed if the system is active)
  SELECT * INTO v_settings
  FROM   "referral_settings"
  LIMIT  1;

  IF v_settings IS NULL OR NOT v_settings."is_active" THEN
    RAISE NOTICE 'Referral settings not active — skipping backfill';
    RETURN;
  END IF;

  -- Only handle FIXED type here; PERCENTAGE needs a deposit amount
  IF v_settings."reward_type" != 'FIXED' THEN
    RAISE NOTICE 'PERCENTAGE reward type — skipping signup backfill';
    RETURN;
  END IF;

  v_reward_amount := v_settings."reward_value";

  IF v_reward_amount <= 0 THEN
    RAISE NOTICE 'Reward value is zero — skipping backfill';
    RETURN;
  END IF;

  -- Loop through every PENDING referral
  FOR v_referral IN
    SELECT * FROM "referrals" WHERE "status" = 'PENDING'
  LOOP
    -- Find the referrer's wallet
    SELECT "id" INTO v_wallet_id
    FROM   "wallets"
    WHERE  "user_id" = v_referral."referrer_id";

    IF v_wallet_id IS NULL THEN
      RAISE NOTICE 'No wallet for referrer % — skipping', v_referral."referrer_id";
      CONTINUE;
    END IF;

    -- Credit referrer wallet
    UPDATE "wallets"
    SET    "balance"    = "balance" + v_reward_amount,
           "updated_at" = NOW()
    WHERE  "id" = v_wallet_id;

    -- Record the credit transaction
    INSERT INTO "transactions"
      ("id", "wallet_id", "type", "amount", "status", "reference", "description", "created_at", "updated_at")
    VALUES
      (gen_random_uuid(), v_wallet_id, 'CREDIT', v_reward_amount, 'COMPLETED',
       'REFERRAL-' || v_referral."id", 'Referral reward', NOW(), NOW());

    -- Mark referral as REWARDED
    UPDATE "referrals"
    SET    "status"        = 'REWARDED',
           "reward_amount" = v_reward_amount,
           "updated_at"    = NOW()
    WHERE  "id" = v_referral."id";

    -- Update referral code stats
    UPDATE "referral_codes"
    SET    "total_uses"   = "total_uses" + 1,
           "total_earned" = "total_earned" + v_reward_amount,
           "updated_at"   = NOW()
    WHERE  "code" = v_referral."code";

    RAISE NOTICE 'Rewarded referrer % — ₦%', v_referral."referrer_id", v_reward_amount;
  END LOOP;
END;
$$;
