import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'

const router = Router()
const INDEFINITE_BLOCK_DURATION_MINUTES = 24 * 60

function normalizeSlotStartMinutes(value) {
  const mins = Number(value)
  return Number.isFinite(mins) ? mins : null
}

function normalizeDurationMinutes(value, fallback = 60) {
  const mins = Number(value)
  return Number.isFinite(mins) && mins > 0 ? mins : fallback
}

function isSameOwnerOrAdmin(profile, ownerId) {
  return profile?.role === 'admin' || ownerId === profile?.id
}

async function ensureVenueWriteAccess(client, profile, venueId) {
  const { rows: venueRows } = await client.query(
    'SELECT id, owner_id FROM venues WHERE id = $1',
    [venueId]
  )
  if (!venueRows.length) return { ok: false, status: 404, error: 'Venue not found' }
  const venue = venueRows[0]
  if (!isSameOwnerOrAdmin(profile, venue.owner_id)) {
    return { ok: false, status: 403, error: 'Not authorized' }
  }
  return { ok: true, venue }
}

// GET /api/slots?venue_id=&date=&court= — get slots for a venue on a date
router.get('/', async (req, res) => {
  const { venue_id, date, court } = req.query
  if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' })

  try {
    let query = 'SELECT * FROM slots WHERE venue_id = $1 AND slot_date = $2'
    const params = [venue_id, date]

    if (court) {
      query += ' AND court_number = $3'
      params.push(parseInt(court))
    }

    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/slots — upsert a slot (venue owner or admin)
router.post('/', requireAuth, loadProfile, async (req, res) => {
  const b = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const access = await ensureVenueWriteAccess(client, req.profile, b.venue_id)
    if (!access.ok) {
      await client.query('ROLLBACK')
      return res.status(access.status).json({ error: access.error })
    }

    const slotStartMinutes = normalizeSlotStartMinutes(b.slot_start_minutes)
    const slotDurationMinutes = normalizeDurationMinutes(b.slot_duration_minutes, 60)
    const slotEndMinutes = slotStartMinutes != null ? slotStartMinutes + slotDurationMinutes : null
    const courtNumber = Number(b.court_number || 1)

    if (b.id) {
      // Update existing slot
      const { rows } = await client.query(`
        UPDATE slots SET
          status = COALESCE($1, status),
          total_capacity = COALESCE($2, total_capacity),
          booked_count = COALESCE($3, booked_count),
          updated_at = NOW()
        WHERE id = $4 RETURNING *
      `, [b.status, b.total_capacity, b.booked_count, b.id])
      await client.query('COMMIT')
      return res.json(rows[0])
    }

    if (!b.venue_id || !b.slot_date || slotStartMinutes == null || !slotEndMinutes) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'venue_id, slot_date, slot_start_minutes, and slot_duration_minutes are required' })
    }

    // Check for existing row with exact same range + court
    const { rows: exactRows } = await client.query(`
      SELECT * FROM slots
      WHERE venue_id = $1
        AND slot_date = $2
        AND court_number = $3
        AND slot_start_minutes = $4
        AND COALESCE(slot_duration_minutes, 60) = $5
      LIMIT 1
    `, [b.venue_id, b.slot_date, courtNumber, slotStartMinutes, slotDurationMinutes])

    const exact = exactRows[0]
    if (exact) {
      const { rows } = await client.query(`
        UPDATE slots SET
          status = COALESCE($1, status),
          total_capacity = COALESCE($2, total_capacity),
          booked_count = COALESCE($3, booked_count),
          updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `, [b.status, b.total_capacity, b.booked_count, exact.id])
      await client.query('COMMIT')
      return res.json(rows[0])
    }

    // For new range rows, reject if there is a booked overlap.
    const { rows: overlapRows } = await client.query(`
      SELECT id, status, booked_count
      FROM slots
      WHERE venue_id = $1
        AND slot_date = $2
        AND court_number = $3
        AND slot_start_minutes IS NOT NULL
        AND slot_start_minutes < $4
        AND (slot_start_minutes + COALESCE(slot_duration_minutes, 60)) > $5
      FOR UPDATE
    `, [b.venue_id, b.slot_date, courtNumber, slotEndMinutes, slotStartMinutes])

    const hasBookedOverlap = overlapRows.some(s => Number(s.booked_count || 0) > 0 || s.status === 'booked' || s.status === 'partial')
    if (hasBookedOverlap) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'This time overlaps an existing booking.' })
    }

    // Insert new slot
    const { rows } = await client.query(`
      INSERT INTO slots (
        venue_id, slot_date, court_number,
        slot_start_minutes, slot_duration_minutes,
        hour_start, status, total_capacity, booked_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      b.venue_id, b.slot_date, courtNumber,
      slotStartMinutes, slotDurationMinutes,
      b.hour_start ?? (slotStartMinutes % 60 === 0 ? slotStartMinutes / 60 : null),
      b.status || 'available', b.total_capacity || 1, b.booked_count || 0,
    ])
    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Slot upsert error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// PATCH /api/slots/:id — update a slot
router.patch('/:id', requireAuth, loadProfile, async (req, res) => {
  const { id } = req.params
  const b = req.body
  try {
    // Build dynamic SET clauses
    const allowed = ['status', 'total_capacity', 'booked_count']
    const setClauses = []
    const values = []
    let idx = 1

    for (const key of allowed) {
      if (b[key] !== undefined) {
        setClauses.push(`${key} = $${idx}`)
        values.push(b[key])
        idx++
      }
    }
    setClauses.push('updated_at = NOW()')
    values.push(id)

    const { rows } = await pool.query(
      `UPDATE slots SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )
    if (!rows.length) return res.status(404).json({ error: 'Slot not found' })
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/slots/block-range — block a continuous time range for a court
router.post('/block-range', requireAuth, loadProfile, async (req, res) => {
  const {
    venue_id,
    slot_date,
    court_number,
    start_minutes,
    duration_minutes,
    no_duration,
    reason,
  } = req.body || {}

  const start = normalizeSlotStartMinutes(start_minutes)
  const duration = no_duration ? INDEFINITE_BLOCK_DURATION_MINUTES : normalizeDurationMinutes(duration_minutes, 60)
  const end = start != null ? start + duration : null
  const court = Number(court_number || 1)

  if (!venue_id || !slot_date || start == null || !end) {
    return res.status(400).json({ error: 'venue_id, slot_date, start_minutes, and duration_minutes are required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const access = await ensureVenueWriteAccess(client, req.profile, venue_id)
    if (!access.ok) {
      await client.query('ROLLBACK')
      return res.status(access.status).json({ error: access.error })
    }

    const { rows: overlapRows } = await client.query(`
      SELECT id, slot_start_minutes, slot_duration_minutes, status, booked_count
      FROM slots
      WHERE venue_id = $1
        AND slot_date = $2
        AND court_number = $3
        AND slot_start_minutes IS NOT NULL
        AND slot_start_minutes < $4
        AND (slot_start_minutes + COALESCE(slot_duration_minutes, 60)) > $5
      FOR UPDATE
    `, [venue_id, slot_date, court, end, start])

    const conflict = overlapRows.find(s => Number(s.booked_count || 0) > 0 || s.status === 'booked' || s.status === 'partial')
    if (conflict) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Cannot block this time range because it overlaps an existing booking.' })
    }

    const exact = overlapRows.find(
      s => Number(s.slot_start_minutes) === start && Number(s.slot_duration_minutes || 60) === duration
    )

    let blockedRow = null

    if (exact) {
      const { rows } = await client.query(
        `UPDATE slots
         SET status = 'blocked', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [exact.id]
      )
      blockedRow = rows[0]
    } else {
      const { rows } = await client.query(`
        INSERT INTO slots (
          venue_id, slot_date, court_number,
          slot_start_minutes, slot_duration_minutes,
          hour_start, status, total_capacity, booked_count
        ) VALUES ($1, $2, $3, $4, $5, $6, 'blocked', 1, 0)
        RETURNING *
      `, [
        venue_id,
        slot_date,
        court,
        start,
        duration,
        start % 60 === 0 ? start / 60 : null,
      ])
      blockedRow = rows[0]
    }

    await client.query('COMMIT')
    res.json({
      ok: true,
      blocked: blockedRow,
      indefinite: !!no_duration,
      reason: reason || null,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Block range error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

export default router
