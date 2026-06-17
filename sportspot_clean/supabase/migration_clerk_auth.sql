-- ════════════════════════════════════════════════════════════
-- Migration: Supabase Auth → Clerk Auth
-- Run this against your Supabase database after setting up Clerk
-- ════════════════════════════════════════════════════════════

-- 1. Add clerk_id and email columns to profiles
alter table profiles add column if not exists clerk_id text unique;
alter table profiles add column if not exists email text;

-- 2. Drop the auth.users foreign key constraint
--    (profiles.id no longer references auth.users)
alter table profiles drop constraint if exists profiles_id_fkey;

-- 3. Change id default to auto-generate UUIDs (no longer from auth.users)
alter table profiles alter column id set default gen_random_uuid();

-- 4. Drop the Supabase Auth signup trigger (no longer needed)
drop trigger if exists trg_new_user on auth.users;
drop function if exists handle_new_user();

-- 5. Drop old RLS policies that depend on auth.uid()
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_update" on profiles;
drop policy if exists "profiles_insert" on profiles;
drop policy if exists "venues_select" on venues;
drop policy if exists "venues_insert" on venues;
drop policy if exists "venues_update" on venues;
drop policy if exists "venues_delete" on venues;
drop policy if exists "slots_insert" on slots;
drop policy if exists "slots_update" on slots;
drop policy if exists "bookings_select" on bookings;
drop policy if exists "bookings_insert" on bookings;
drop policy if exists "bookings_update" on bookings;
drop policy if exists "reviews_insert" on reviews;
drop policy if exists "reviews_update" on reviews;

-- 6. Helper: get profile UUID from Clerk user ID in JWT sub claim
create or replace function clerk_profile_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.profiles where clerk_id = (current_setting('request.jwt.claims', true)::json ->> 'sub') limit 1
$$;

-- 7. Updated get_my_role() using clerk_id lookup
create or replace function get_my_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where clerk_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')),
    'user'::user_role
  )
$$;

-- 8. Recreate RLS policies using clerk_profile_id()

-- ── PROFILES ──
create policy "profiles_select"
  on profiles for select
  using (clerk_id = (current_setting('request.jwt.claims', true)::json ->> 'sub') or get_my_role() = 'admin');

create policy "profiles_update"
  on profiles for update
  using (clerk_id = (current_setting('request.jwt.claims', true)::json ->> 'sub') or get_my_role() = 'admin');

create policy "profiles_insert"
  on profiles for insert
  with check (true);  -- Allow inserts from authenticated users (signup flow)

-- ── VENUES ──
create policy "venues_select"
  on venues for select
  using (
    status = 'approved'
    or owner_id = clerk_profile_id()
    or get_my_role() = 'admin'
  );

create policy "venues_insert"
  on venues for insert
  with check (
    owner_id = clerk_profile_id()
    and get_my_role() in ('venue', 'admin')
  );

create policy "venues_update"
  on venues for update
  using (owner_id = clerk_profile_id() or get_my_role() = 'admin');

create policy "venues_delete"
  on venues for delete
  using (get_my_role() = 'admin');

-- ── SLOTS ──
create policy "slots_insert"
  on slots for insert
  with check (
    get_my_role() = 'admin'
    or get_my_role() = 'user'
    or exists (select 1 from venues where id = venue_id and owner_id = clerk_profile_id())
  );

create policy "slots_update"
  on slots for update
  using (
    get_my_role() = 'admin'
    or booked_by = clerk_profile_id()
    or get_my_role() = 'user'
    or exists (select 1 from venues where id = venue_id and owner_id = clerk_profile_id())
  );

-- ── BOOKINGS ──
create policy "bookings_select"
  on bookings for select
  using (
    user_id = clerk_profile_id()
    or get_my_role() = 'admin'
    or exists (select 1 from venues where id = venue_id and owner_id = clerk_profile_id())
  );

create policy "bookings_insert"
  on bookings for insert
  with check (user_id = clerk_profile_id() and get_my_role() = 'user');

create policy "bookings_update"
  on bookings for update
  using (user_id = clerk_profile_id() or get_my_role() = 'admin');

-- ── REVIEWS ──
create policy "reviews_insert"
  on reviews for insert
  with check (user_id = clerk_profile_id());

create policy "reviews_update"
  on reviews for update
  using (user_id = clerk_profile_id());

-- ════════════════════════════════════════════════════════════
-- IMPORTANT: Clerk + Supabase JWT Integration
-- ════════════════════════════════════════════════════════════
--
-- For RLS to work, you MUST create a JWT template in Clerk:
--
-- 1. Go to Clerk Dashboard → JWT Templates
-- 2. Create a new template named "supabase"
-- 3. Set the signing algorithm to HS256
-- 4. Set the signing key to your SUPABASE_JWT_SECRET
--    (find this in Supabase Dashboard → Settings → API → JWT Secret)
-- 5. The template claims should be:
--    {
--      "app_metadata": {},
--      "aud": "authenticated",
--      "email": "{{user.primary_email_address}}",
--      "role": "authenticated",
--      "user_metadata": {}
--    }
--
-- Clerk automatically injects "sub" (set to the Clerk user ID),
-- "iat", and "exp" claims. auth.uid() in Supabase reads "sub",
-- so our RLS policies match clerk_id = auth.uid()::text.
-- ════════════════════════════════════════════════════════════
