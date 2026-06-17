import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { sendBookingNotification } from '../lib/email.js'
import { processBookingWalletEvent } from '../lib/wallet.js'
import { confirmCheckoutCoins, getCheckoutCoinsSummary } from '../lib/wallet.js'

const router = Router()

function normalizeSlotsPayload(slots = []) {
  return (slots || []).map(s => ({
    courtNumber: Number(s.courtNumber || 1),
    slotStartMinutes: Number(s.slotStartMinutes),
    durationMinutes: Number(s.durationMinutes || 60),
    slotLabel: s.slotLabel,
  }))
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

async function findRegularBookingConflict(client, venueId, date, slot) {
  const endMins = slot.slotStartMinutes + slot.durationMinutes
  const { rows } = await client.query(`
    SELECT id, status, booked_count, slot_start_minutes, slot_duration_minutes
    FROM slots
    WHERE venue_id = $1
      AND slot_date = $2
      AND court_number = $3
      AND slot_start_minutes IS NOT NULL
      AND slot_start_minutes < $4
      AND (slot_start_minutes + COALESCE(slot_duration_minutes, 60)) > $5
  `, [venueId, date, slot.courtNumber, endMins, slot.slotStartMinutes])

  return rows.find(r =>
    r.status === 'blocked' ||
    Number(r.booked_count || 0) > 0 ||
    r.status === 'booked' ||
    r.status === 'partial'
  ) || null
}

// POST /api/bookings/precheck — validate slots before opening payment
router.post('/precheck', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })

  const { venue_id, date, slots } = req.body || {}
  const normalizedSlots = normalizeSlotsPayload(slots)

  if (!venue_id || !date || !normalizedSlots.length) {
    return res.status(400).json({ error: 'venue_id, date and slots are required' })
  }

  const client = await pool.connect()
  try {
    for (const slot of normalizedSlots) {
      if (!Number.isFinite(slot.slotStartMinutes) || !Number.isFinite(slot.durationMinutes) || slot.durationMinutes <= 0) {
        return res.status(400).json({ error: 'Invalid slot time range in request.' })
      }
      const conflict = await findRegularBookingConflict(client, venue_id, date, slot)
      if (conflict) {
        return res.status(409).json({
          error: `${slot.slotLabel || 'Selected slot'} is no longer available. Please choose another slot.`
        })
      }
    }
    return res.json({ ok: true })
  } catch (err) {
    console.error('Booking precheck error:', err)
    return res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// POST /api/bookings — create booking with atomic slot allocation
// Replaces both the book_slot RPC and the bookings insert
router.post('/', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })

  const { venue_id, date, slots, payment_ref, subtotal, platform_fee, total_amount, slots_label, wallet_request_id } = req.body
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const savedSlotIds = []

    for (const s of slots) {
      const courtNum = Number(s.courtNumber || 1)
      const startMins = Number(s.slotStartMinutes)
      const duration = Number(s.durationMinutes || 60)
      const endMins = startMins + duration
      const hourStart = startMins % 60 === 0 ? startMins / 60 : null

      if (startMins == null || duration <= 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Invalid slot time range in booking request.' })
      }

      // Lock all overlapping slots for this court and time range.
      let { rows } = await client.query(`
        SELECT * FROM slots
        WHERE venue_id = $1
          AND slot_date = $2
          AND court_number = $3
          AND slot_start_minutes IS NOT NULL
          AND slot_start_minutes < $4
          AND (slot_start_minutes + COALESCE(slot_duration_minutes, 60)) > $5
        FOR UPDATE
      `, [venue_id, date, courtNum, endMins, startMins])

      const exact = rows.find(r =>
        Number(r.slot_start_minutes) === Number(startMins) &&
        Number(r.slot_duration_minutes || 60) === Number(duration)
      )

      const conflictingOverlap = rows.find(r => {
        if (exact && r.id === exact.id) return false
        return r.status === 'blocked' || Number(r.booked_count || 0) > 0 || r.status === 'booked' || r.status === 'partial'
      })

      if (conflictingOverlap) {
        await client.query('ROLLBACK')
        return res.status(409).json({
          error: `${s.slotLabel || 'Selected time'} overlaps an existing booking.`
        })
      }

      let slot = exact

      if (!slot) {
        // Create the slot row
        const { rows: created } = await client.query(`
          INSERT INTO slots (
            venue_id, slot_date, court_number, slot_start_minutes,
            slot_duration_minutes, hour_start,
            status, total_capacity, booked_count
          ) VALUES ($1, $2, $3, $4, $5, $6, 'available', 1, 0)
          RETURNING *
        `, [venue_id, date, courtNum, startMins, duration, hourStart])
        slot = created[0]
      }

      // Check constraints
      if (slot.status === 'blocked') {
        await client.query('ROLLBACK')
        return res.status(409).json({
          error: `${s.slotLabel || 'Slot'} has been blocked by the venue.`
        })
      }

      if (Number(slot.booked_count || 0) > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({
          error: `${s.slotLabel || 'Slot'} is no longer available. Please choose another slot.`
        })
      }

      // Increment booked_count and update status
      const newBookedCount = Number(slot.booked_count || 0) + 1
      const newStatus = 'booked'

      await client.query(`
        UPDATE slots SET
          booked_count = $1, status = $2, booked_by = $3, updated_at = NOW()
        WHERE id = $4
      `, [newBookedCount, newStatus, req.profile.id, slot.id])

      savedSlotIds.push(slot.id)
    }

    // Create booking record
    const baseSubtotal = roundMoney(subtotal)
    const basePlatformFee = roundMoney(platform_fee || 0)
    const baseTotal = roundMoney(total_amount || (baseSubtotal + basePlatformFee))

    const coinSummary = wallet_request_id
      ? await getCheckoutCoinsSummary(client, {
        profile: req.profile,
        requestId: wallet_request_id,
      })
      : { applied_rc: 0, applied_inr: 0 }

    const appliedCoinsRc = roundMoney(coinSummary.applied_rc || 0)
    const appliedCoinsInr = roundMoney(coinSummary.applied_inr || 0)
    const payableAmount = roundMoney(Math.max(baseTotal - appliedCoinsInr, 0))

    const { rows: bookingRows } = await client.query(`
      INSERT INTO bookings (
        user_id, venue_id, slot_ids, booking_date,
        slots_label, subtotal, platform_fee, total_amount,
        status, payment_status, payment_ref, wallet_redemption_rc
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', 'paid', $9, $10)
      RETURNING *
    `, [
      req.profile.id, venue_id, savedSlotIds, date,
      slots_label, baseSubtotal, basePlatformFee, payableAmount,
      payment_ref,
      appliedCoinsRc,
    ])

    if (wallet_request_id) {
      await confirmCheckoutCoins(client, {
        profile: req.profile,
        bookingId: bookingRows[0].id,
        requestId: wallet_request_id,
      })
    }

    await processBookingWalletEvent(client, bookingRows[0], req.profile)

    await client.query('COMMIT')

    // Fetch venue info + owner email for response & notification
    const { rows: venueInfo } = await pool.query(
      `SELECT v.name, v.sport_icon, v.city, v.lat, v.lng, p.email AS owner_email
       FROM venues v
       LEFT JOIN profiles p ON p.id = v.owner_id
       WHERE v.id = $1`,
      [venue_id]
    )

    const booking = { ...bookingRows[0], venues: venueInfo[0] || null }
    res.json(booking)

    // Fire-and-forget: send email notification to venue owner
    if (venueInfo[0]) {
      sendBookingNotification({
        venueOwnerEmail: venueInfo[0].owner_email,
        venueName: venueInfo[0].name,
        customerName: req.profile.full_name,
        customerPhone: req.profile.phone,
        bookingDate: date,
        slotsLabel: slots_label,
        totalAmount: total_amount,
        paymentRef: payment_ref,
      }).catch(() => {}) // silently ignore — booking already saved
    }
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Booking error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// GET /api/bookings — list my bookings
router.get('/', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
  try {
    const { rows } = await pool.query(`
      SELECT b.*,
        json_build_object(
          'name', v.name, 'sport_type', v.sport_type,
          'sport_icon', v.sport_icon, 'city', v.city,
          'lat', v.lat, 'lng', v.lng
        ) as venues
      FROM bookings b
      LEFT JOIN venues v ON v.id = b.venue_id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `, [req.profile.id])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/bookings/venue — list bookings for venue owner's venues
router.get('/venue', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
  try {
    const { rows } = await pool.query(`
      SELECT b.*,
        json_build_object('full_name', p.full_name, 'phone', p.phone) as profiles,
        json_build_object('name', v.name, 'sport_icon', v.sport_icon) as venues
      FROM bookings b
      LEFT JOIN profiles p ON p.id = b.user_id
      LEFT JOIN venues v ON v.id = b.venue_id
      WHERE b.venue_id IN (SELECT id FROM venues WHERE owner_id = $1)
      ORDER BY b.created_at DESC
    `, [req.profile.id])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/bookings/my-slots?venue_id=&date= — get slot keys I've booked
router.get('/my-slots', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.json([])
  const { venue_id, date } = req.query
  if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' })

  try {
    // Get all my confirmed bookings for this venue+date
    const { rows: myBookings } = await pool.query(`
      SELECT slot_ids FROM bookings
      WHERE user_id = $1 AND venue_id = $2 AND booking_date = $3 AND status = 'confirmed'
    `, [req.profile.id, venue_id, date])

    const allSlotIds = myBookings.flatMap(b => b.slot_ids || [])
    if (!allSlotIds.length) return res.json([])

    // Look up slot details
    const { rows: mySlots } = await pool.query(`
      SELECT id, court_number, slot_start_minutes, hour_start
      FROM slots WHERE id = ANY($1)
    `, [allSlotIds])

    // Return "court:mins" keys
    const keys = mySlots.map(s => {
      const mins = s.slot_start_minutes ?? (s.hour_start != null ? s.hour_start * 60 : null)
      const court = s.court_number ?? 1
      return `${court}:${mins}`
    }).filter(k => !k.includes('null'))

    res.json(keys)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
