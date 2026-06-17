import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, loadProfile, requireRole } from '../middleware/auth.js'

const router = Router()

// All admin routes require admin role
router.use(requireAuth, loadProfile, requireRole('admin'))

// GET /api/admin/stats — overview statistics
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const [venues, bookings, users] = await Promise.all([
      pool.query('SELECT status FROM venues'),
      pool.query('SELECT booking_date, payment_status, total_amount FROM bookings'),
      pool.query('SELECT role FROM profiles'),
    ])

    const vs = venues.rows
    const bs = bookings.rows
    const us = users.rows

    res.json({
      totalVenues: vs.length,
      pendingVenues: vs.filter(v => v.status === 'pending').length,
      approvedVenues: vs.filter(v => v.status === 'approved').length,
      totalBookings: bs.length,
      todayBookings: bs.filter(b => b.booking_date === today).length,
      totalRevenue: bs.filter(b => b.payment_status === 'paid').reduce((s, b) => s + (b.total_amount || 0), 0),
      totalUsers: us.filter(u => u.role === 'user').length,
      totalOwners: us.filter(u => u.role === 'venue').length,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/venues — all venues with owner profiles
router.get('/venues', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT v.*,
        json_build_object(
          'full_name', p.full_name, 'phone', p.phone, 'city', p.city
        ) as profiles
      FROM venues v
      LEFT JOIN profiles p ON p.id = v.owner_id
      ORDER BY v.created_at DESC
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/bookings — all bookings with venue & user info
router.get('/bookings', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*,
        json_build_object('name', v.name, 'sport_icon', v.sport_icon) as venues,
        json_build_object('full_name', p.full_name) as profiles
      FROM bookings b
      LEFT JOIN venues v ON v.id = b.venue_id
      LEFT JOIN profiles p ON p.id = b.user_id
      ORDER BY b.created_at DESC
    `)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/users — all profiles
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM profiles ORDER BY created_at DESC'
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
