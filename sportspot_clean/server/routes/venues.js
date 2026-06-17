import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, loadProfile, requireRole } from '../middleware/auth.js'

const router = Router()

// GET /api/venues — list approved venues (public)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM venues WHERE status = 'approved' ORDER BY rating DESC`
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/venues/mine — list venues owned by current user
router.get('/mine', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
  try {
    const { rows } = await pool.query(
      `SELECT * FROM venues WHERE owner_id = $1 ORDER BY created_at DESC`,
      [req.profile.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/venues — create a venue
router.post('/', requireAuth, loadProfile, requireRole('venue', 'admin'), async (req, res) => {
  const b = req.body
  try {
    const { rows } = await pool.query(`
      INSERT INTO venues (
        owner_id, name, description, sport_type, sport_icon, sport_types,
        address, city, state, pincode, lat, lng,
        price_per_hour, capacity,
        open_time, close_time, slot_duration_minutes,
        num_courts, court_label, courts,
        amenities, rules, status, images
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14,
        $15, $16, $17,
        $18, $19, $20::jsonb,
        $21, $22, $23, $24
      ) RETURNING *
    `, [
      req.profile.id, b.name, b.description || null,
      b.sport_type, b.sport_icon || '🏟️', b.sport_types || [b.sport_type],
      b.address, b.city, b.state || null, b.pincode || null,
      b.lat || null, b.lng || null,
      b.price_per_hour, b.capacity || 1,
      b.open_time ?? 6, b.close_time ?? 22, b.slot_duration_minutes || 60,
      b.num_courts || 1, b.court_label || 'Court', JSON.stringify(b.courts || []),
      b.amenities || [], b.rules || null, b.status || 'pending', b.images || [],
    ])
    res.json(rows[0])
  } catch (err) {
    console.error('Venue insert error:', err)
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/venues/:id — update a venue
router.patch('/:id', requireAuth, loadProfile, async (req, res) => {
  const { id } = req.params
  // Only owner or admin can update
  try {
    const { rows: existing } = await pool.query('SELECT owner_id FROM venues WHERE id = $1', [id])
    if (!existing.length) return res.status(404).json({ error: 'Venue not found' })
    if (existing[0].owner_id !== req.profile.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const fields = req.body
    const setClauses = []
    const values = []
    let idx = 1

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'id' || key === 'owner_id' || key === 'created_at') continue
      if (key === 'courts') {
        setClauses.push(`${key} = $${idx}::jsonb`)
        values.push(JSON.stringify(value))
      } else if (key === 'amenities' || key === 'images' || key === 'sport_types') {
        setClauses.push(`${key} = $${idx}`)
        values.push(value)
      } else {
        setClauses.push(`${key} = $${idx}`)
        values.push(value)
      }
      idx++
    }

    if (!setClauses.length) return res.json(existing[0])

    setClauses.push(`updated_at = NOW()`)
    values.push(id)

    const { rows } = await pool.query(
      `UPDATE venues SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )
    res.json(rows[0])
  } catch (err) {
    console.error('Venue update error:', err)
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/venues/:id/status — admin: change venue status
router.patch('/:id/status', requireAuth, loadProfile, requireRole('admin'), async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  try {
    if (status === 'approved') {
      const { rows: venueRows } = await pool.query(
        'SELECT sport_type FROM venues WHERE id = $1',
        [id]
      )
      if (!venueRows.length) return res.status(404).json({ error: 'Venue not found' })

      if (venueRows[0].sport_type === 'gaming') {
        const { rows: setupRows } = await pool.query(
          'SELECT COUNT(*)::int AS count FROM gaming_setups WHERE venue_id = $1',
          [id]
        )
        if ((setupRows[0]?.count || 0) < 1) {
          return res.status(400).json({ error: 'Cannot approve gaming venue without setup configuration' })
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE venues SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Venue not found' })
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/venues/:id — admin: delete venue
router.delete('/:id', requireAuth, loadProfile, requireRole('admin'), async (req, res) => {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      'DELETE FROM venues WHERE id = $1 RETURNING id, name',
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Venue not found' })
    res.json({ deleted: true, venue: rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
