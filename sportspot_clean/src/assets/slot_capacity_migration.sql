-- ═══════════════════════════════════════════════════════════
-- Rabonna — Database Migration
-- Run this ONCE in your Supabase SQL Editor:
-- Dashboard → SQL Editor → New Query → paste → Run
-- ═══════════════════════════════════════════════════════════

-- 1. Add 'partial' status to slot_status enum (safe, skips if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'partial'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'slot_status')
  ) THEN
    ALTER TYPE slot_status ADD VALUE 'partial';
  END IF;
END
$$;

-- 2. Add multi-capacity columns to slots table
ALTER TABLE slots
  ADD COLUMN IF NOT EXISTS total_capacity  int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS booked_count    int NOT NULL DEFAULT 0;

-- 3. Add default slot capacity column to venues table
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS slot_capacity   int NOT NULL DEFAULT 1;

-- 4. Backfill: existing booked slots should show booked_count = 1
UPDATE slots
SET booked_count = 1
WHERE status = 'booked' AND booked_count = 0;

-- 5. Ensure realtime is enabled for slots table
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE slots;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$$;

-- 6. Index for faster slot queries
CREATE INDEX IF NOT EXISTS idx_slots_venue_date ON slots(venue_id, slot_date);

-- Done! ✅
-- After running this, set up Razorpay:
-- 1. Create account at https://razorpay.com
-- 2. Settings > API Keys > Generate Test Key
-- 3. Copy the Key ID (starts rzp_test_...)
-- 4. Add to .env:  VITE_RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
-- 5. For production use rzp_live_... key
