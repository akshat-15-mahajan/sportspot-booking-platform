# SportSpot – Complete Setup Guide

A full-stack sports venue booking platform with three separate portals for Players, Venue Owners, and Admins.

---

## Architecture

```
/          → Player Portal  (book turfs, courts, tracks)
/venue     → Venue Owner Portal (manage listings & slots)
/admin     → Admin Portal  (approve venues, oversee everything)
```

Each portal has its **own login page**. Accounts are role-locked — a venue owner who tries to access `/` gets rejected, and vice versa.

---

## Step 1 – Create Your Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Give it a name: `sportspot`
3. Choose a region close to India (Singapore or Mumbai)
4. Set a strong database password and save it
5. Wait ~2 minutes for provisioning

---

## Step 2 – Run the Database Schema

1. In your Supabase project → **SQL Editor** → **New Query**
2. Open the file `supabase/schema.sql` from this repo
3. **Select all** and **Run** the entire file
4. You should see: `Success. No rows returned`

This creates:
- `profiles` table (extends Supabase auth)
- `venues` table (with PostGIS location support)
- `slots` table (hourly availability)
- `bookings` table (confirmed reservations)
- `reviews` table
- All Row Level Security policies
- Auto-profile creation trigger on signup
- Realtime enabled for slots + bookings

---

## Step 3 – Configure Environment Variables

1. In Supabase → **Project Settings** → **API**
2. Copy **Project URL** and **anon/public key**
3. In your project root, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

4. Fill in `.env`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

---

## Step 4 – Create the Three Demo Accounts

Each account is created through **Supabase Auth** with a specific role. Here's how to create all three:

### Option A – Via Supabase Dashboard (Recommended for initial setup)

Go to **Authentication** → **Users** → **Add User** for each:

| Role         | Email                      | Password      |
|--------------|---------------------------|---------------|
| Admin        | admin@sportspot.com       | Admin@123     |
| Venue Owner  | venue@sportspot.com       | Venue@123     |
| Player       | player@sportspot.com      | Player@123    |

After creating each user, **manually set the role** in the `profiles` table:

Go to **Table Editor** → `profiles` → find the user → edit `role`:
- `admin@sportspot.com` → set role to `admin`
- `venue@sportspot.com` → set role to `venue`
- `player@sportspot.com` → set role to `user`

### Option B – Via the App (Sign Up Flow)

1. Go to `/` → Sign Up → creates a `user` account
2. Go to `/venue` → Register → creates a `venue` account (needs admin approval)
3. Admin account must be created via Supabase Dashboard (role upgrade from SQL)

### Upgrading a User to Admin (SQL)

```sql
-- Find user ID first
select id, full_name from profiles where role = 'user';

-- Upgrade to admin
update profiles set role = 'admin' where id = 'paste-uuid-here';
```

---

## Step 5 – Add Sample Venues

After creating the venue owner account and getting their UUID:

```sql
-- Get the venue owner's UUID
select id from profiles where role = 'venue' limit 1;

-- Insert sample venues (replace <venue-owner-uuid>)
insert into venues (owner_id, name, description, sport_type, sport_icon, address, city, state, lat, lng, price_per_hour, capacity, amenities, status) values
(
  '<venue-owner-uuid>',
  'Premier 5-a-Side Turf',
  'FIFA certified artificial turf with floodlights. Perfect for 5-a-side matches.',
  'football', '⚽',
  'Plot 12, Sector 18, Noida',
  'Noida', 'Uttar Pradesh',
  28.5708, 77.3261,
  1500, 10,
  ARRAY['Floodlights', 'Changing Rooms', 'Parking', 'Drinking Water', 'First Aid'],
  'approved'
),
(
  '<venue-owner-uuid>',
  'Capital Cricket Ground',
  'Full-size cricket ground with professional pitch and practice nets.',
  'cricket', '🏏',
  'Dwarka, Sector 12, New Delhi',
  'New Delhi', 'Delhi',
  28.5921, 77.0460,
  2500, 22,
  ARRAY['Pitch', 'Practice Nets', 'Scoreboard', 'Seating', 'Parking'],
  'approved'
),
(
  '<venue-owner-uuid>',
  'Aces Pickleball Club',
  'Dedicated pickleball courts with professional equipment available for rent.',
  'pickleball', '🏓',
  'Cyber Hub, Gurugram',
  'Gurugram', 'Haryana',
  28.4944, 77.0886,
  800, 4,
  ARRAY['Equipment Rental', 'AC Lounge', 'Coaching', 'Parking', 'Cafe'],
  'approved'
),
(
  '<venue-owner-uuid>',
  'Rush Go-Kart Track',
  'Professional go-kart racing track with 300m circuit. Helmets and karts provided.',
  'gokart', '🏎️',
  'NH-8, Manesar, Gurugram',
  'Gurugram', 'Haryana',
  28.3590, 76.9360,
  3500, 8,
  ARRAY['Karts Included', 'Helmets', 'Safety Gear', 'Timing System', 'Cafe'],
  'approved'
),
(
  '<venue-owner-uuid>',
  'The Billiards Den',
  'Premium pool tables in a club-style ambiance. Snooker and pool available.',
  'pool', '🎱',
  'Connaught Place, New Delhi',
  'New Delhi', 'Delhi',
  28.6315, 77.2167,
  600, 4,
  ARRAY['AC', 'Beverages', 'Coaching', 'Tournaments'],
  'approved'
);
```

---

## Step 6 – Install and Run

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Visit:
- `http://localhost:5173/` → Player Portal
- `http://localhost:5173/venue` → Venue Owner Portal
- `http://localhost:5173/admin` → Admin Portal

---

## Step 7 – Enable Supabase Realtime (Optional)

For live slot updates when someone books:

1. Go to Supabase → **Database** → **Replication**
2. Ensure `slots` and `bookings` tables have replication enabled
3. The schema.sql already runs `alter publication supabase_realtime add table slots;`

---

## Login Credentials (Demo)

| Portal        | URL      | Email                  | Password    |
|---------------|----------|------------------------|-------------|
| 🏃 Player     | `/`      | player@sportspot.com   | Player@123  |
| 🏢 Venue Owner| `/venue` | venue@sportspot.com    | Venue@123   |
| 👑 Admin      | `/admin` | admin@sportspot.com    | Admin@123   |

> **Note:** Passwords must be set by you when creating accounts in Supabase Auth.
> These are the suggested credentials for the demo setup.

---

## Feature Summary

### Player Portal (`/`)
- Auto-detect location via browser geolocation OR manual city search
- Browse approved venues with sport filter, text search, distance
- Select date from 14-day calendar strip
- Pick hourly slots (6 AM – 9 PM), multi-select supported
- Simulated payment modal → booking confirmed → success screen with ref
- My Bookings history
- Real-time slot lock (slot disappears as someone else books it)

### Venue Owner Portal (`/venue`)
- Register and submit venue for admin approval
- Add details: sport type, address, GPS coordinates, price, amenities
- Slot Manager: block/unblock any hour on any future date
- View all customer bookings with contact details
- Revenue dashboard

### Admin Portal (`/admin`)
- Approve/reject/suspend venue listings
- Full venue management table with filters
- All bookings across all venues
- User directory (players + owners + admins)
- Slot Override: force-block or clear any slot on any venue

---

## File Structure

```
sportspot/
├── supabase/
│   └── schema.sql          ← Run this in Supabase SQL Editor
├── src/
│   ├── lib/
│   │   ├── supabase.js     ← Supabase client
│   │   └── constants.js    ← Sports config, helpers, fee calc
│   ├── hooks/
│   │   ├── useAuth.jsx     ← Auth context + hook
│   │   └── useToast.js     ← Toast notifications
│   ├── components/
│   │   ├── UI.jsx          ← Shared components (Nav, Modal, etc.)
│   │   └── RouteGuards.jsx ← Role-based route protection
│   ├── pages/
│   │   ├── UserAuth.jsx        ← Player login/signup
│   │   ├── VenueAuth.jsx       ← Venue owner login/signup
│   │   ├── AdminAuth.jsx       ← Admin login
│   │   ├── UserDashboard.jsx   ← Full booking experience
│   │   ├── VenueDashboard.jsx  ← Venue management
│   │   └── AdminDashboard.jsx  ← Admin panel
│   ├── styles/
│   │   └── global.css      ← Dark-theme design system
│   ├── App.jsx             ← Router (3 separate portals)
│   └── main.jsx            ← Entry point
├── index.html
├── vite.config.js
├── package.json
└── .env.example
```

---

## Tech Stack

| Layer       | Tech                    |
|-------------|-------------------------|
| Frontend    | React 18 + Vite         |
| Routing     | React Router v6         |
| Backend     | Supabase (PostgreSQL)   |
| Auth        | Supabase Auth           |
| Realtime    | Supabase Realtime       |
| Geo         | PostGIS (via Supabase)  |
| Payments    | Simulated (no gateway)  |
| Fonts       | Syne + Inter (Google)   |

---

## Adding Real Payments (Razorpay)

When you're ready to go live, replace the `confirmPayment` function in `UserDashboard.jsx`:

```jsx
// 1. Install: npm install razorpay
// 2. Create an order server-side (Supabase Edge Function)
// 3. Open Razorpay checkout:

const options = {
  key: import.meta.env.VITE_RAZORPAY_KEY,
  amount: fees.total * 100, // paise
  currency: 'INR',
  name: 'SportSpot',
  description: `Booking at ${venue.name}`,
  handler: async (response) => {
    // response.razorpay_payment_id → save as payment_ref
    await confirmBookingWithPaymentId(response.razorpay_payment_id)
  },
}
const rzp = new window.Razorpay(options)
rzp.open()
```

---

## Production Deployment

```bash
# Build
npm run build

# Deploy to Vercel
npx vercel deploy --prod

# Or Netlify
npx netlify deploy --prod --dir=dist
```

Set environment variables in your hosting platform:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
