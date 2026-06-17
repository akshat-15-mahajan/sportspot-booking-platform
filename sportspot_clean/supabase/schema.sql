-- ============================================================
--  SportSpot – FIXED Schema
--  Run this in Supabase SQL Editor (fresh run)
--  If you already ran the old schema, run the RESET section first
-- ============================================================

-- ─── RESET (run this block FIRST if you have old tables) ─────
-- Go to Supabase SQL Editor, paste and run this block alone:
/*
drop trigger if exists trg_new_user on auth.users;
drop trigger if exists trg_profiles_updated on profiles;
drop trigger if exists trg_venues_updated on venues;
drop trigger if exists trg_slots_updated on slots;
drop trigger if exists trg_bookings_updated on bookings;
drop trigger if exists trg_venue_rating on reviews;
drop function if exists handle_new_user() cascade;
drop function if exists set_updated_at() cascade;
drop function if exists update_venue_rating() cascade;
drop function if exists get_my_role() cascade;
drop table if exists reviews cascade;
drop table if exists bookings cascade;
drop table if exists slots cascade;
drop table if exists venues cascade;
drop table if exists profiles cascade;
drop type if exists user_role cascade;
drop type if exists venue_status cascade;
drop type if exists slot_status cascade;
drop type if exists booking_status cascade;
drop type if exists payment_status cascade;
*/

-- ─── ENUMS ───────────────────────────────────────────────────
create type user_role      as enum ('user', 'venue', 'admin');
create type venue_status   as enum ('pending', 'approved', 'rejected', 'suspended');
create type slot_status    as enum ('available', 'booked', 'blocked', 'partial');
create type booking_status as enum ('pending', 'confirmed', 'cancelled', 'refunded');
create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');

-- ─── PROFILES ────────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          user_role not null default 'user',
  full_name     text,
  phone         text,
  avatar_url    text,
  city          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── VENUES ──────────────────────────────────────────────────
create table venues (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles(id) on delete cascade,
  name            text not null,
  description     text,
  sport_type      text not null,
  sport_icon      text not null default '🏟️',
  address         text not null,
  city            text not null,
  state           text,
  pincode         text,
  lat             numeric(10,7),
  lng             numeric(10,7),
  price_per_hour  numeric(10,2) not null,
  capacity        int default 1,
  slot_capacity   int default 1,
  amenities       text[] default '{}',
  rules           text,
  status          venue_status default 'pending',
  rating          numeric(3,2) default 0,
  total_reviews   int default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index venues_sport_type_idx on venues(sport_type);
create index venues_status_idx on venues(status);
create index venues_city_idx on venues(city);
create index venues_owner_idx on venues(owner_id);

-- ─── SLOTS ───────────────────────────────────────────────────
create table slots (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  slot_date   date not null,
  hour_start  int not null check (hour_start >= 0 and hour_start <= 23),
  status      slot_status default 'available',
  booked_by       uuid references profiles(id) on delete set null,
  total_capacity  int not null default 1,
  booked_count    int not null default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(venue_id, slot_date, hour_start)
);

create index slots_venue_date_idx on slots(venue_id, slot_date);
create index slots_status_idx on slots(status);

-- ─── BOOKINGS ────────────────────────────────────────────────
create table bookings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  venue_id        uuid not null references venues(id) on delete cascade,
  slot_ids        uuid[] not null,
  booking_date    date not null,
  slots_label     text[] not null,
  subtotal        numeric(10,2) not null,
  platform_fee    numeric(10,2) not null,
  total_amount    numeric(10,2) not null,
  status          booking_status default 'pending',
  payment_status  payment_status default 'pending',
  payment_ref     text,
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index bookings_user_idx   on bookings(user_id);
create index bookings_venue_idx  on bookings(venue_id);
create index bookings_date_idx   on bookings(booking_date);
create index bookings_status_idx on bookings(status);

-- ─── REVIEWS ─────────────────────────────────────────────────
create table reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  venue_id    uuid not null references venues(id) on delete cascade,
  rating      int not null check (rating >= 1 and rating <= 5),
  comment     text,
  created_at  timestamptz default now()
);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated  before update on profiles  for each row execute function set_updated_at();
create trigger trg_venues_updated    before update on venues    for each row execute function set_updated_at();
create trigger trg_slots_updated     before update on slots     for each row execute function set_updated_at();
create trigger trg_bookings_updated  before update on bookings  for each row execute function set_updated_at();

-- ─── VENUE RATING TRIGGER ────────────────────────────────────
create or replace function update_venue_rating()
returns trigger language plpgsql as $$
begin
  update venues set
    rating = coalesce((select round(avg(rating)::numeric, 2) from reviews where venue_id = coalesce(new.venue_id, old.venue_id)), 0),
    total_reviews = (select count(*) from reviews where venue_id = coalesce(new.venue_id, old.venue_id))
  where id = coalesce(new.venue_id, old.venue_id);
  return coalesce(new, old);
end;
$$;

create trigger trg_venue_rating
  after insert or update or delete on reviews
  for each row execute function update_venue_rating();

-- ─── AUTO-CREATE PROFILE ON SIGNUP (THE CRITICAL FIX) ────────
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parsed_role user_role := 'user';
begin
  -- Safely cast role from metadata
  begin
    if new.raw_user_meta_data->>'role' in ('user', 'venue', 'admin') then
      parsed_role := (new.raw_user_meta_data->>'role')::user_role;
    end if;
  exception when others then
    parsed_role := 'user';
  end;

  insert into public.profiles (id, role, full_name, phone, city)
  values (
    new.id,
    parsed_role,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'city', '')
  )
  on conflict (id) do nothing;

  return new;
exception when others then
  -- Never block signup even if profile insert fails
  return new;
end;
$$;

drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── HELPER FUNCTION ─────────────────────────────────────────
create or replace function get_my_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'user'::user_role
  )
$$;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
alter table profiles  enable row level security;
alter table venues    enable row level security;
alter table slots     enable row level security;
alter table bookings  enable row level security;
alter table reviews   enable row level security;

-- ── PROFILES ──
create policy "profiles_select"
  on profiles for select
  using (id = auth.uid() or get_my_role() = 'admin');

create policy "profiles_update"
  on profiles for update
  using (id = auth.uid() or get_my_role() = 'admin');

-- Allow the trigger to insert (needed for signup)
create policy "profiles_insert"
  on profiles for insert
  with check (id = auth.uid());

-- ── VENUES ──
create policy "venues_select"
  on venues for select
  using (
    status = 'approved'
    or owner_id = auth.uid()
    or get_my_role() = 'admin'
  );

create policy "venues_insert"
  on venues for insert
  with check (
    owner_id = auth.uid()
    and get_my_role() in ('venue', 'admin')
  );

create policy "venues_update"
  on venues for update
  using (owner_id = auth.uid() or get_my_role() = 'admin');

create policy "venues_delete"
  on venues for delete
  using (get_my_role() = 'admin');

-- ── SLOTS ──
create policy "slots_select"
  on slots for select using (true);

create policy "slots_insert"
  on slots for insert
  with check (
    get_my_role() = 'admin'
    or get_my_role() = 'user'
    or exists (select 1 from venues where id = venue_id and owner_id = auth.uid())
  );

create policy "slots_update"
  on slots for update
  using (
    get_my_role() = 'admin'
    or booked_by = auth.uid()
    or get_my_role() = 'user'
    or exists (select 1 from venues where id = venue_id and owner_id = auth.uid())
  );

-- ── BOOKINGS ──
create policy "bookings_select"
  on bookings for select
  using (
    user_id = auth.uid()
    or get_my_role() = 'admin'
    or exists (select 1 from venues where id = venue_id and owner_id = auth.uid())
  );

create policy "bookings_insert"
  on bookings for insert
  with check (user_id = auth.uid() and get_my_role() = 'user');

create policy "bookings_update"
  on bookings for update
  using (user_id = auth.uid() or get_my_role() = 'admin');

-- ── REVIEWS ──
create policy "reviews_select" on reviews for select using (true);
create policy "reviews_insert" on reviews for insert with check (user_id = auth.uid());
create policy "reviews_update" on reviews for update using (user_id = auth.uid());

-- ─── REALTIME ────────────────────────────────────────────────
alter publication supabase_realtime add table slots;
alter publication supabase_realtime add table bookings;

-- ─── VERIFY ──────────────────────────────────────────────────
-- Run this to confirm everything was created correctly:
-- select table_name from information_schema.tables where table_schema = 'public';
