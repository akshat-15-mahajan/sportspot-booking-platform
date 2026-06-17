-- ════════════════════════════════════════════════════════════
-- Migration: Multi-court naming, pricing & multi-sport support
-- Run this in Supabase SQL Editor after the Clerk auth migration
-- ════════════════════════════════════════════════════════════

-- 1. Add courts JSONB column to venues
--    Each element: { number, name, sport_type, sport_icon, price_per_hour }
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS courts jsonb DEFAULT '[]'::jsonb;

-- 2. Backfill existing venues — generate courts array from existing num_courts + price
UPDATE venues
SET courts = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'number', n,
      'name', COALESCE(court_label, 'Court') || ' ' || n,
      'sport_type', sport_type,
      'sport_icon', sport_icon,
      'price_per_hour', price_per_hour
    )
  )
  FROM generate_series(1, GREATEST(COALESCE(num_courts, 1), 1)) AS n
)
WHERE courts = '[]'::jsonb OR courts IS NULL;

-- 3. Add sport_types array for multi-sport filtering
--    Derived from courts data; kept denormalized for fast queries
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS sport_types text[] DEFAULT '{}';

-- 4. Backfill sport_types from existing sport_type
UPDATE venues
SET sport_types = ARRAY[sport_type]
WHERE sport_types = '{}' OR sport_types IS NULL;

-- 5. Index for multi-sport filtering
CREATE INDEX IF NOT EXISTS idx_venues_sport_types ON venues USING GIN (sport_types);

-- Done! ✅
