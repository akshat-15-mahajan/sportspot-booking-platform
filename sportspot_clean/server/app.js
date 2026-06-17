import express from 'express'
import cors from 'cors'
import { clerkMiddleware } from '@clerk/express'

import { pool } from './db.js'
import profileRoutes from './routes/profiles.js'
import venueRoutes from './routes/venues.js'
import slotRoutes from './routes/slots.js'
import bookingRoutes from './routes/bookings.js'
import reviewRoutes from './routes/reviews.js'
import adminRoutes from './routes/admin.js'
import uploadRoutes from './routes/upload.js'
import gamingRoutes from './routes/gaming.js'
import walletRoutes from './routes/wallet.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.locals.pool = pool

// Clerk middleware — parses JWT and makes getAuth(req) available
app.use(clerkMiddleware())

// API routes
app.use('/api/profile', profileRoutes)
app.use('/api/slots', slotRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/gaming', gamingRoutes)
app.use('/api/wallet', walletRoutes)

// Public venue search — no auth required (must be before venue router)
app.get('/api/venues/search', async (req, res) => {
  try {
    const { q, sport, city, minPrice, maxPrice, sort } = req.query
    let where = ["v.status = 'approved'"]
    const params = []
    let idx = 1

    if (q) {
      where.push(`(LOWER(v.name) LIKE $${idx} OR LOWER(v.city) LIKE $${idx} OR LOWER(v.address) LIKE $${idx} OR LOWER(v.sport_type) LIKE $${idx})`)
      params.push(`%${q.toLowerCase()}%`)
      idx++
    }
    if (sport) {
      where.push(`(v.sport_type = $${idx} OR $${idx} = ANY(v.sport_types))`)
      params.push(sport.toLowerCase())
      idx++
    }
    if (city) {
      where.push(`LOWER(v.city) = $${idx}`)
      params.push(city.toLowerCase())
      idx++
    }
    if (minPrice) {
      where.push(`v.price_per_hour >= $${idx}`)
      params.push(parseFloat(minPrice))
      idx++
    }
    if (maxPrice) {
      where.push(`v.price_per_hour <= $${idx}`)
      params.push(parseFloat(maxPrice))
      idx++
    }

    let orderBy = 'v.rating DESC, v.total_reviews DESC'
    if (sort === 'price_asc') orderBy = 'v.price_per_hour ASC'
    else if (sort === 'price_desc') orderBy = 'v.price_per_hour DESC'
    else if (sort === 'newest') orderBy = 'v.created_at DESC'

    const { rows } = await pool.query(
      `SELECT v.id, v.name, v.sport_type, v.sport_icon, v.sport_types, v.address, v.city, v.state,
              v.price_per_hour, v.rating, v.total_reviews, v.images, v.amenities,
              v.open_time, v.close_time, v.slot_duration_minutes, v.num_courts, v.court_label, v.capacity
       FROM venues v
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT 50`,
      params
    )
    res.json(rows)
  } catch (err) {
    console.error('Venue search error:', err)
    res.status(500).json({ error: 'Search failed' })
  }
})

// Public top venues — no auth required
app.get('/api/venues/top', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, sport_type, sport_icon, sport_types, address, city, state,
              price_per_hour, rating, total_reviews, images, amenities
       FROM venues
       WHERE status = 'approved'
       ORDER BY rating DESC, total_reviews DESC
       LIMIT 6`
    )
    res.json(rows)
  } catch (err) {
    console.error('Top venues error:', err)
    res.status(500).json({ error: 'Failed to fetch top venues' })
  }
})

// Public venue detail — no auth required
app.get('/api/venues/:id/public', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, p.full_name as owner_name
       FROM venues v
       LEFT JOIN profiles p ON p.id = v.owner_id
       WHERE v.id = $1 AND v.status = 'approved'`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Venue not found' })
    const venue = rows[0]

    // Attach gaming config for gaming venues
    if (venue.sport_type === 'gaming') {
      const [setupsRes, consolesRes, gamesRes, ps5PricingRes] = await Promise.all([
        pool.query('SELECT * FROM gaming_setups WHERE venue_id = $1 ORDER BY setup_type', [venue.id]),
        pool.query('SELECT * FROM gaming_consoles WHERE venue_id = $1 ORDER BY console_number', [venue.id]),
        pool.query('SELECT * FROM gaming_games WHERE venue_id = $1 ORDER BY name', [venue.id]),
        pool.query(`SELECT gp.* FROM gaming_ps5_pricing gp
          JOIN gaming_setups gs ON gs.id = gp.setup_id
          WHERE gs.venue_id = $1 ORDER BY gp.player_count`, [venue.id]),
      ])
      const consoleIds = consolesRes.rows.map(c => c.id)
      let consoleGames = []
      if (consoleIds.length) {
        const { rows: cgRows } = await pool.query(
          'SELECT * FROM gaming_console_games WHERE console_id = ANY($1)', [consoleIds]
        )
        consoleGames = cgRows
      }
      venue.gaming_config = {
        setups: setupsRes.rows,
        consoles: consolesRes.rows,
        games: gamesRes.rows,
        consoleGames,
        ps5Pricing: ps5PricingRes.rows,
      }
    }

    res.json(venue)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Venue CRUD routes (after public venue search/top/detail routes)
app.use('/api/venues', venueRoutes)

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// Diagnostic endpoint — check env vars and DB (remove after debugging)
app.get('/api/debug', async (req, res) => {
  // Skip Clerk auth for this endpoint
  const checks = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
    CLERK_PUBLISHABLE_KEY: !!process.env.CLERK_PUBLISHABLE_KEY,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    NODE_ENV: process.env.NODE_ENV || 'not set',
    db: false,
    dbError: null,
  }
  try {
    await pool.query('SELECT 1')
    checks.db = true
  } catch (err) {
    checks.dbError = err.message
  }
  res.json(checks)
})

// Public stats for landing page (no auth required)
app.get('/api/stats', async (req, res) => {
  try {
    const [venueCount, bookingCount, playerCount, citiesResult] = await Promise.all([
      pool.query("SELECT count(*) FROM venues WHERE status = 'approved'"),
      pool.query("SELECT count(*) FROM bookings"),
      pool.query("SELECT count(*) FROM profiles WHERE role = 'user'"),
      pool.query("SELECT DISTINCT lower(city) FROM venues WHERE status = 'approved' AND city IS NOT NULL"),
    ])
    res.json({
      venues: parseInt(venueCount.rows[0].count),
      bookings: parseInt(bookingCount.rows[0].count),
      players: parseInt(playerCount.rows[0].count),
      cities: citiesResult.rowCount,
    })
  } catch (err) {
    console.error('Stats error:', err)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

export default app
