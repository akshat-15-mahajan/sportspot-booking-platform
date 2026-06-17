-- ============================================================
--  Gaming Category Migration
--  Adds gaming venue support: PS5, Car Racing Wheel, PS VR2
-- ============================================================

-- ─── GAMING SETUPS (per setup-type per venue) ────────────────
CREATE TABLE IF NOT EXISTS gaming_setups (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  setup_type            text NOT NULL CHECK (setup_type IN ('ps5', 'car_racing', 'ps_vr2')),
  num_units             int NOT NULL DEFAULT 1,
  slot_duration_minutes int NOT NULL DEFAULT 60,
  price_per_session     numeric(10,2),          -- used by car_racing & ps_vr2
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(venue_id, setup_type)
);

-- ─── GAMING CONSOLES / RIGS / HEADSETS ───────────────────────
CREATE TABLE IF NOT EXISTS gaming_consoles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id        uuid NOT NULL REFERENCES gaming_setups(id) ON DELETE CASCADE,
  venue_id        uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  console_number  int NOT NULL,
  label           text NOT NULL,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(setup_id, console_number)
);

-- ─── GAMING GAMES CATALOG ────────────────────────────────────
CREATE TABLE IF NOT EXISTS gaming_games (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  setup_type      text NOT NULL CHECK (setup_type IN ('ps5', 'car_racing', 'ps_vr2')),
  name            text NOT NULL,
  created_at      timestamptz DEFAULT now()
);

-- ─── CONSOLE ↔ GAME MAPPING (M2M) ───────────────────────────
CREATE TABLE IF NOT EXISTS gaming_console_games (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  console_id      uuid NOT NULL REFERENCES gaming_consoles(id) ON DELETE CASCADE,
  game_id         uuid NOT NULL REFERENCES gaming_games(id) ON DELETE CASCADE,
  UNIQUE(console_id, game_id)
);

-- ─── PS5 PLAYER-COUNT PRICING ────────────────────────────────
CREATE TABLE IF NOT EXISTS gaming_ps5_pricing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id        uuid NOT NULL REFERENCES gaming_setups(id) ON DELETE CASCADE,
  player_count    int NOT NULL CHECK (player_count >= 1 AND player_count <= 4),
  price           numeric(10,2) NOT NULL,
  UNIQUE(setup_id, player_count)
);

-- ─── GAMING BOOKING DETAILS (extends bookings) ──────────────
CREATE TABLE IF NOT EXISTS gaming_booking_details (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  setup_type            text NOT NULL,
  game_id               uuid REFERENCES gaming_games(id) ON DELETE SET NULL,
  game_name             text,
  console_id            uuid REFERENCES gaming_consoles(id) ON DELETE SET NULL,
  console_label         text,
  player_count          int DEFAULT 1,
  price                 numeric(10,2) NOT NULL,
  slot_date             date NOT NULL,
  slot_start_minutes    int NOT NULL,
  slot_duration_minutes int NOT NULL,
  created_at            timestamptz DEFAULT now()
);

-- ─── INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gaming_setups_venue      ON gaming_setups(venue_id);
CREATE INDEX IF NOT EXISTS idx_gaming_consoles_setup    ON gaming_consoles(setup_id);
CREATE INDEX IF NOT EXISTS idx_gaming_consoles_venue    ON gaming_consoles(venue_id);
CREATE INDEX IF NOT EXISTS idx_gaming_games_venue       ON gaming_games(venue_id);
CREATE INDEX IF NOT EXISTS idx_gaming_games_setup_type  ON gaming_games(venue_id, setup_type);
CREATE INDEX IF NOT EXISTS idx_gaming_console_games_cid ON gaming_console_games(console_id);
CREATE INDEX IF NOT EXISTS idx_gaming_console_games_gid ON gaming_console_games(game_id);
CREATE INDEX IF NOT EXISTS idx_gaming_booking_details   ON gaming_booking_details(booking_id);
CREATE INDEX IF NOT EXISTS idx_gaming_booking_date      ON gaming_booking_details(slot_date, console_id);

-- ─── TRIGGERS ────────────────────────────────────────────────
CREATE TRIGGER trg_gaming_setups_updated
  BEFORE UPDATE ON gaming_setups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
