-- ============================================================
--  SportSpot – Local PostgreSQL Schema (Express backend)
--  No Supabase-specific features (no RLS, no auth.users)
-- ============================================================

SET client_encoding = 'UTF8';

-- ─── ENUMS ───────────────────────────────────────────────────
CREATE TYPE user_role      AS ENUM ('user', 'venue', 'admin');
CREATE TYPE venue_status   AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE slot_status    AS ENUM ('available', 'booked', 'blocked', 'partial');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- ─── PROFILES ────────────────────────────────────────────────
CREATE TABLE profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id      text UNIQUE,
  email         text,
  role          user_role NOT NULL DEFAULT 'user',
  full_name     text,
  phone         text,
  avatar_url    text,
  city          text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ─── VENUES ──────────────────────────────────────────────────
CREATE TABLE venues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  sport_type      text NOT NULL,
  sport_icon      text NOT NULL DEFAULT '',
  address         text NOT NULL,
  city            text NOT NULL,
  state           text,
  pincode         text,
  lat             numeric(10,7),
  lng             numeric(10,7),
  price_per_hour  numeric(10,2) NOT NULL,
  capacity        int DEFAULT 1,
  slot_capacity   int DEFAULT 1,
  amenities       text[] DEFAULT '{}',
  rules           text,
  images          text[] DEFAULT '{}',
  courts          jsonb DEFAULT '[]'::jsonb,
  sport_types     text[] DEFAULT '{}',
  num_courts      int DEFAULT 1,
  court_label     text DEFAULT 'Court',
  open_time       int DEFAULT 6,
  close_time      int DEFAULT 22,
  slot_duration_minutes int DEFAULT 60,
  status          venue_status DEFAULT 'pending',
  rating          numeric(3,2) DEFAULT 0,
  total_reviews   int DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX venues_sport_type_idx ON venues(sport_type);
CREATE INDEX venues_status_idx ON venues(status);
CREATE INDEX venues_city_idx ON venues(city);
CREATE INDEX venues_owner_idx ON venues(owner_id);
CREATE INDEX idx_venues_sport_types ON venues USING GIN (sport_types);

-- ─── SLOTS ───────────────────────────────────────────────────
CREATE TABLE slots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  slot_date             date NOT NULL,
  hour_start            int CHECK (hour_start >= 0 AND hour_start <= 23),
  court_number          int DEFAULT 1,
  slot_start_minutes    int,
  slot_duration_minutes int DEFAULT 60,
  status                slot_status DEFAULT 'available',
  booked_by             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  total_capacity        int NOT NULL DEFAULT 1,
  booked_count          int NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX slots_venue_date_idx ON slots(venue_id, slot_date);
CREATE INDEX slots_status_idx ON slots(status);

-- ─── BOOKINGS ────────────────────────────────────────────────
CREATE TABLE bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id        uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  slot_ids        uuid[] NOT NULL,
  booking_date    date NOT NULL,
  slots_label     text[] NOT NULL,
  court_number    int DEFAULT 1,
  subtotal        numeric(10,2) NOT NULL,
  platform_fee    numeric(10,2) NOT NULL,
  total_amount    numeric(10,2) NOT NULL,
  status          booking_status DEFAULT 'pending',
  payment_status  payment_status DEFAULT 'pending',
  payment_ref     text,
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX bookings_user_idx   ON bookings(user_id);
CREATE INDEX bookings_venue_idx  ON bookings(venue_id);
CREATE INDEX bookings_date_idx   ON bookings(booking_date);
CREATE INDEX bookings_status_idx ON bookings(status);

-- ─── REVIEWS ─────────────────────────────────────────────────
CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id    uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  rating      int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     text,
  created_at  timestamptz DEFAULT now()
);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated  BEFORE UPDATE ON profiles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venues_updated    BEFORE UPDATE ON venues    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_slots_updated     BEFORE UPDATE ON slots     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated  BEFORE UPDATE ON bookings  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── VENUE RATING TRIGGER ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_venue_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE venues SET
    rating = COALESCE((SELECT round(avg(rating)::numeric, 2) FROM reviews WHERE venue_id = COALESCE(NEW.venue_id, OLD.venue_id)), 0),
    total_reviews = (SELECT count(*) FROM reviews WHERE venue_id = COALESCE(NEW.venue_id, OLD.venue_id))
  WHERE id = COALESCE(NEW.venue_id, OLD.venue_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_venue_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_venue_rating();
