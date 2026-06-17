-- ============================================================
--  Rabonna Coins (RC) wallet + gamification schema
--  Apply after the base schema in server/schema.sql
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_txn_type') THEN
    CREATE TYPE wallet_txn_type AS ENUM (
      'signup_bonus',
      'booking_reward',
      'referral_bonus',
      'streak_bonus',
      'milestone_bonus',
      'mission_reward',
      'redemption',
      'expiry_extension',
      'manual_adjustment'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_level') THEN
    CREATE TYPE wallet_level AS ENUM ('rookie', 'bronze', 'silver', 'champion');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_type') THEN
    CREATE TYPE mission_type AS ENUM ('weekly', 'one_time');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_trigger') THEN
    CREATE TYPE mission_trigger AS ENUM ('signup', 'booking_completed', 'referral_completed');
  END IF;
END
$$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wallet_referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS wallet_level wallet_level NOT NULL DEFAULT 'rookie',
  ADD COLUMN IF NOT EXISTS wallet_xp numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_streak_days int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_last_booking_date date,
  ADD COLUMN IF NOT EXISTS wallet_week_start_date date,
  ADD COLUMN IF NOT EXISTS wallet_week_booking_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_total_bookings int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_total_rc_earned numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_total_rc_spent numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS wallet_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS wallet_event_key text,
  ADD COLUMN IF NOT EXISTS wallet_reward_rc numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_redemption_rc numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_type wallet_txn_type NOT NULL,
  source_type     text NOT NULL,
  source_id       text NOT NULL,
  rc_amount       numeric(12,2) NOT NULL DEFAULT 0,
  remaining_rc    numeric(12,2) NOT NULL DEFAULT 0,
  expires_at      timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_profile_idx ON wallet_transactions(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_expiry_idx ON wallet_transactions(profile_id, expires_at);
CREATE INDEX IF NOT EXISTS wallet_transactions_type_idx ON wallet_transactions(transaction_type, source_type);

CREATE TABLE IF NOT EXISTS referrals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code         text UNIQUE NOT NULL,
  referrer_profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referee_profile_id    uuid UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'pending',
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at          timestamptz,
  reward_paid_at        timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_profile_id);
CREATE INDEX IF NOT EXISTS referrals_referee_idx ON referrals(referee_profile_id);

CREATE TABLE IF NOT EXISTS missions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,
  title           text NOT NULL,
  description     text NOT NULL,
  mission_type    mission_type NOT NULL,
  trigger_event   mission_trigger NOT NULL,
  target_count    int NOT NULL DEFAULT 1,
  rc_reward       numeric(12,2) NOT NULL DEFAULT 0,
  xp_reward       numeric(12,2) NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT TRUE,
  reset_policy    text NOT NULL DEFAULT 'one_time',
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_progress (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mission_id        uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  progress_count    int NOT NULL DEFAULT 0,
  source_event_key  text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at      timestamptz,
  claimed_at        timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (profile_id, mission_id, period_start)
);

CREATE INDEX IF NOT EXISTS mission_progress_profile_idx ON mission_progress(profile_id, completed_at);

CREATE OR REPLACE FUNCTION set_wallet_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_transactions_updated ON wallet_transactions;
CREATE TRIGGER trg_wallet_transactions_updated
  BEFORE UPDATE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION set_wallet_updated_at();

DROP TRIGGER IF EXISTS trg_referrals_updated ON referrals;
CREATE TRIGGER trg_referrals_updated
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION set_wallet_updated_at();

DROP TRIGGER IF EXISTS trg_missions_updated ON missions;
CREATE TRIGGER trg_missions_updated
  BEFORE UPDATE ON missions
  FOR EACH ROW EXECUTE FUNCTION set_wallet_updated_at();

DROP TRIGGER IF EXISTS trg_mission_progress_updated ON mission_progress;
CREATE TRIGGER trg_mission_progress_updated
  BEFORE UPDATE ON mission_progress
  FOR EACH ROW EXECUTE FUNCTION set_wallet_updated_at();
