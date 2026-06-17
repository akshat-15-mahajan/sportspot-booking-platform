import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'

const router = Router()

// GET /api/reviews/mine — get current user's review ratings (venue_id → rating)
router.get('/mine', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.json({})
  try {
    const { rows } = await pool.query(
      'SELECT venue_id, rating FROM reviews WHERE user_id = $1',
      [req.profile.id]
    )
    const map = {}
    rows.forEach(r => { map[r.venue_id] = r.rating })
    res.json(map)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/reviews — create or update a review
router.post('/', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
  const { venue_id, rating, booking_id, comment } = req.body

  try {
    // Check if review exists
    const { rows: existing } = await pool.query(
      'SELECT id FROM reviews WHERE user_id = $1 AND venue_id = $2',
      [req.profile.id, venue_id]
    )

    if (existing.length) {
      await pool.query(
        'UPDATE reviews SET rating = $1 WHERE user_id = $2 AND venue_id = $3',
        [rating, req.profile.id, venue_id]
      )
    } else {
      await pool.query(`
        INSERT INTO reviews (user_id, venue_id, rating, booking_id, comment)
        VALUES ($1, $2, $3, $4, $5)
      `, [req.profile.id, venue_id, rating, booking_id || null, comment || null])
    }

    // Trigger venue rating update (replicate the DB trigger behavior)
    await pool.query(`
      UPDATE venues SET
        rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE venue_id = $1), 0),
        total_reviews = (SELECT COUNT(*) FROM reviews WHERE venue_id = $1)
      WHERE id = $1
    `, [venue_id])

    res.json({ success: true })
  } catch (err) {
    console.error('Review error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
