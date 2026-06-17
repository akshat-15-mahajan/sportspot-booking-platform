import { Router } from 'express'
import { put } from '@vercel/blob'
import { pool } from '../db.js'
import { requireAuth, loadProfile, requireRole } from '../middleware/auth.js'
import { processBookingWalletEvent } from '../lib/wallet.js'
import { confirmCheckoutCoins, getCheckoutCoinsSummary } from '../lib/wallet.js'

const router = Router()

function toSlotList(slot_start_minutes, slot_start_minutes_list) {
  return Array.isArray(slot_start_minutes_list) && slot_start_minutes_list.length
    ? slot_start_minutes_list.map(Number)
    : (slot_start_minutes != null ? [Number(slot_start_minutes)] : [])
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

async function getGamingEligibleConsoles(client, { setupId, gameId, setupType }) {
  if (gameId && setupType === 'ps5') {
    const { rows } = await client.query(`
      SELECT gc.* FROM gaming_consoles gc
      JOIN gaming_console_games gcg ON gcg.console_id = gc.id
      WHERE gc.setup_id = $1 AND gcg.game_id = $2
      ORDER BY gc.console_number
    `, [setupId, gameId])
    return rows
  }
  const { rows } = await client.query(
    'SELECT * FROM gaming_consoles WHERE setup_id = $1 ORDER BY console_number',
    [setupId]
  )
  return rows
}

async function ensureExclusiveGamingSlotAvailable(client, { venueId, date, setupId, slotStartMinutes }) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    [`gaming:${venueId}:${date}:${setupId}:${slotStartMinutes}`]
  )

  const { rows } = await client.query(`
    SELECT 1
    FROM gaming_booking_details gbd
    JOIN gaming_consoles gc ON gc.id = gbd.console_id
    JOIN bookings b ON b.id = gbd.booking_id
    WHERE gc.setup_id = $1
      AND gbd.slot_date = $2
      AND gbd.slot_start_minutes = $3
      AND b.status = 'confirmed'
    LIMIT 1
  `, [setupId, date, slotStartMinutes])

  return rows.length === 0
}

// ── SETUP-TYPE METADATA ──────────────────────────────────────
const SETUP_TYPES = {
  ps5:        { label: 'PS5',              icon: '🎮', slotDuration: 60, maxPlayers: 4, unitLabel: 'Console' },
  car_racing: { label: 'Car Racing Wheel', icon: '🏎️', slotDuration: 60, maxPlayers: 1, unitLabel: 'Rig' },
  ps_vr2:     { label: 'PS VR2',           icon: '🥽', slotDuration: 30, maxPlayers: 1, unitLabel: 'Headset' },
}

// ─────────────────────────────────────────────────────────────
// GET /api/gaming/setup-types — list valid setup types + metadata
// ─────────────────────────────────────────────────────────────
router.get('/setup-types', (_req, res) => res.json(SETUP_TYPES))

// ─────────────────────────────────────────────────────────────
// GET /api/gaming/config/:venueId — full gaming config (public)
// ─────────────────────────────────────────────────────────────
router.get('/config/:venueId', async (req, res) => {
  const { venueId } = req.params
  try {
    // Setups
    const { rows: setups } = await pool.query(
      'SELECT * FROM gaming_setups WHERE venue_id = $1 ORDER BY setup_type', [venueId]
    )

    // Consoles
    const { rows: consoles } = await pool.query(
      'SELECT * FROM gaming_consoles WHERE venue_id = $1 ORDER BY console_number', [venueId]
    )

    // Games
    const { rows: games } = await pool.query(
      'SELECT * FROM gaming_games WHERE venue_id = $1 ORDER BY name', [venueId]
    )

    // Console-game mappings
    const consoleIds = consoles.map(c => c.id)
    let consoleGames = []
    if (consoleIds.length) {
      const { rows } = await pool.query(
        'SELECT * FROM gaming_console_games WHERE console_id = ANY($1)', [consoleIds]
      )
      consoleGames = rows
    }

    // PS5 pricing
    const ps5Setup = setups.find(s => s.setup_type === 'ps5')
    let ps5Pricing = []
    if (ps5Setup) {
      const { rows } = await pool.query(
        'SELECT * FROM gaming_ps5_pricing WHERE setup_id = $1 ORDER BY player_count', [ps5Setup.id]
      )
      ps5Pricing = rows
    }

    res.json({ setups, consoles, games, consoleGames, ps5Pricing })
  } catch (err) {
    console.error('Gaming config fetch error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/gaming/config/:venueId — save/update full config
// (venue owner or admin)
// ─────────────────────────────────────────────────────────────
router.post('/config/:venueId', requireAuth, loadProfile, async (req, res) => {
  const { venueId } = req.params
  const { setups: setupsInput } = req.body   // array of setup configs

  const client = await pool.connect()
  try {
    // Verify ownership
    const { rows: venueRows } = await client.query('SELECT owner_id FROM venues WHERE id = $1', [venueId])
    if (!venueRows.length) { client.release(); return res.status(404).json({ error: 'Venue not found' }) }
    if (venueRows[0].owner_id !== req.profile.id && req.profile.role !== 'admin') {
      client.release(); return res.status(403).json({ error: 'Not authorized' })
    }

    await client.query('BEGIN')

    // Delete old data in reverse-dependency order
    await client.query('DELETE FROM gaming_console_games WHERE console_id IN (SELECT id FROM gaming_consoles WHERE venue_id = $1)', [venueId])
    await client.query('DELETE FROM gaming_ps5_pricing WHERE setup_id IN (SELECT id FROM gaming_setups WHERE venue_id = $1)', [venueId])
    await client.query('DELETE FROM gaming_consoles WHERE venue_id = $1', [venueId])
    await client.query('DELETE FROM gaming_games WHERE venue_id = $1', [venueId])
    await client.query('DELETE FROM gaming_setups WHERE venue_id = $1', [venueId])

    const savedSetups = []

    for (const s of (setupsInput || [])) {
      const meta = SETUP_TYPES[s.setup_type]
      if (!meta) continue

      // Insert setup
      const { rows: setupRows } = await client.query(`
        INSERT INTO gaming_setups (venue_id, setup_type, num_units, slot_duration_minutes, price_per_session)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `, [venueId, s.setup_type, s.num_units || 1, meta.slotDuration, s.price_per_session || null])
      const setup = setupRows[0]

      // Insert consoles
      const savedConsoles = []
      for (let i = 1; i <= (s.num_units || 1); i++) {
        const label = `${meta.unitLabel} ${i}`
        const { rows: cRows } = await client.query(`
          INSERT INTO gaming_consoles (setup_id, venue_id, console_number, label)
          VALUES ($1, $2, $3, $4) RETURNING *
        `, [setup.id, venueId, i, label])
        savedConsoles.push(cRows[0])
      }

      // Insert games
      const savedGames = []
      for (const g of (s.games || [])) {
        const maxPlayers = g.max_players ? parseInt(g.max_players) : null

        // Handle cover photo: if base64 data URL, upload to blob storage
        let coverPhoto = g.cover_photo || null
        if (coverPhoto && coverPhoto.startsWith('data:')) {
          try {
            const matches = coverPhoto.match(/^data:(image\/\w+);base64,(.+)$/)
            if (matches) {
              const contentType = matches[1]
              const buffer = Buffer.from(matches[2], 'base64')
              if (buffer.length <= 5 * 1024 * 1024) {
                const ext = contentType.split('/')[1] || 'jpg'
                const blobPath = `game-covers/${venueId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
                const blob = await put(blobPath, buffer, { access: 'public', contentType })
                coverPhoto = blob.url
              } else {
                coverPhoto = null
              }
            } else {
              coverPhoto = null
            }
          } catch (uploadErr) {
            console.error('Game cover upload error:', uploadErr)
            coverPhoto = null
          }
        }

        const { rows: gRows } = await client.query(`
          INSERT INTO gaming_games (venue_id, setup_type, name, max_players, cover_photo)
          VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [venueId, s.setup_type, g.name, maxPlayers, coverPhoto])
        const game = gRows[0]

        // Map game → consoles
        for (const consoleNum of (g.consoleNumbers || [])) {
          const console = savedConsoles.find(c => c.console_number === consoleNum)
          if (console) {
            await client.query(`
              INSERT INTO gaming_console_games (console_id, game_id) VALUES ($1, $2)
            `, [console.id, game.id])
          }
        }

        savedGames.push({ ...game, consoleNumbers: g.consoleNumbers || [] })
      }

      // PS5 pricing
      let savedPricing = []
      if (s.setup_type === 'ps5' && s.pricing) {
        for (const p of s.pricing) {
          const { rows: pRows } = await client.query(`
            INSERT INTO gaming_ps5_pricing (setup_id, player_count, price)
            VALUES ($1, $2, $3) RETURNING *
          `, [setup.id, p.player_count, p.price])
          savedPricing.push(pRows[0])
        }
      }

      savedSetups.push({ ...setup, consoles: savedConsoles, games: savedGames, pricing: savedPricing })
    }

    // Update the venue's slot_duration_minutes to the shortest gaming setup duration
    if (savedSetups.length) {
      const minDuration = Math.min(...savedSetups.map(s => s.slot_duration_minutes))
      await client.query(
        'UPDATE venues SET slot_duration_minutes = $1, updated_at = NOW() WHERE id = $2',
        [minDuration, venueId]
      )
    }

    await client.query('COMMIT')
    res.json({ setups: savedSetups })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Gaming config save error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/gaming/availability
//   ?venue_id=&date=&setup_type=&game_id=
// Returns availability per time slot
// ─────────────────────────────────────────────────────────────
router.get('/availability', async (req, res) => {
  const { venue_id, date, setup_type, game_id } = req.query
  if (!venue_id || !date || !setup_type) {
    return res.status(400).json({ error: 'venue_id, date, and setup_type required' })
  }

  try {
    // Get the setup
    const { rows: setupRows } = await pool.query(
      'SELECT * FROM gaming_setups WHERE venue_id = $1 AND setup_type = $2',
      [venue_id, setup_type]
    )
    if (!setupRows.length) return res.json({ slots: [], totalUnits: 0 })
    const setup = setupRows[0]

    // Get consoles for this setup
    let consoles
    if (game_id) {
      // Only consoles that have this game installed
      const { rows } = await pool.query(`
        SELECT gc.* FROM gaming_consoles gc
        JOIN gaming_console_games gcg ON gcg.console_id = gc.id
        WHERE gc.setup_id = $1 AND gcg.game_id = $2
        ORDER BY gc.console_number
      `, [setup.id, game_id])
      consoles = rows
    } else {
      const { rows } = await pool.query(
        'SELECT * FROM gaming_consoles WHERE setup_id = $1 ORDER BY console_number',
        [setup.id]
      )
      consoles = rows
    }

    const totalUnits = consoles.length

    // Get existing bookings for this date + these consoles
    const consoleIds = consoles.map(c => c.id)
    let bookedSlots = []
    if (consoleIds.length) {
      const { rows } = await pool.query(`
        SELECT gbd.slot_start_minutes, gbd.console_id, gbd.slot_duration_minutes
        FROM gaming_booking_details gbd
        JOIN bookings b ON b.id = gbd.booking_id
        WHERE gbd.console_id = ANY($1)
          AND gbd.slot_date = $2
          AND b.status = 'confirmed'
      `, [consoleIds, date])
      bookedSlots = rows
    }

    // Also check blocked slots in the regular slots table
    const { rows: blockedSlots } = await pool.query(`
      SELECT slot_start_minutes, court_number FROM slots
      WHERE venue_id = $1 AND slot_date = $2 AND status = 'blocked'
    `, [venue_id, date])

    // Get venue open/close times
    const { rows: venueRows } = await pool.query(
      'SELECT open_time, close_time FROM venues WHERE id = $1', [venue_id]
    )
    const openTime = venueRows[0]?.open_time ?? 6
    const closeTime = venueRows[0]?.close_time ?? 22
    const duration = setup.slot_duration_minutes

    // Generate time slots
    const timeSlots = []
    let t = openTime * 60
    const end = closeTime * 60
    while (t + duration <= end) {
      // Count how many consoles are booked at this time
      const bookedCount = bookedSlots.filter(bs => bs.slot_start_minutes === t).length

      // Count blocked consoles at this time
      const blockedConsoleNums = blockedSlots
        .filter(bs => bs.slot_start_minutes === t)
        .map(bs => bs.court_number)
      const blockedInSetup = consoles.filter(c => blockedConsoleNums.includes(c.console_number)).length

      const available = Math.max(0, totalUnits - bookedCount - blockedInSetup)

      timeSlots.push({
        slotStartMinutes: t,
        durationMinutes: duration,
        totalUnits,
        booked: bookedCount,
        blocked: blockedInSetup,
        available,
        status: available === 0 ? 'full' : available < totalUnits ? 'partial' : 'available',
      })
      t += duration
    }

    res.json({ slots: timeSlots, totalUnits, setup })
  } catch (err) {
    console.error('Gaming availability error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/gaming/precheck — validate selected gaming slots
// ─────────────────────────────────────────────────────────────
router.post('/precheck', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })

  const { venue_id, date, setup_type, game_id, slot_start_minutes, slot_start_minutes_list } = req.body || {}
  const slotList = toSlotList(slot_start_minutes, slot_start_minutes_list)

  if (!venue_id || !date || !setup_type || !slotList.length) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const client = await pool.connect()
  try {
    const { rows: setupRows } = await client.query(
      'SELECT * FROM gaming_setups WHERE venue_id = $1 AND setup_type = $2',
      [venue_id, setup_type]
    )
    if (!setupRows.length) return res.status(404).json({ error: 'Gaming setup not found' })
    const setup = setupRows[0]

    const consoles = await getGamingEligibleConsoles(client, {
      setupId: setup.id,
      gameId: game_id,
      setupType: setup_type,
    })

    if (!consoles.length) {
      return res.status(409).json({ error: 'No consoles available for this game' })
    }

    for (const startMins of slotList) {
      const slotStart = Number(startMins)
      if (!Number.isFinite(slotStart)) {
        return res.status(400).json({ error: 'Invalid slot time in request' })
      }

      const isExclusiveOpen = await ensureExclusiveGamingSlotAvailable(client, {
        venueId: venue_id,
        date,
        setupId: setup.id,
        slotStartMinutes: slotStart,
      })
      if (!isExclusiveOpen) {
        return res.status(409).json({ error: `Slot ${slotStart} is no longer available.` })
      }

      const blockedConsoleIds = consoles.map(c => c.console_number)
      const { rows: blockedSlots } = await client.query(`
        SELECT court_number FROM slots
        WHERE venue_id = $1 AND slot_date = $2 AND slot_start_minutes = $3 AND status = 'blocked'
      `, [venue_id, date, slotStart])

      const blockedNums = new Set(blockedSlots.map(s => Number(s.court_number)))
      const anyOpenConsole = blockedConsoleIds.some(num => !blockedNums.has(Number(num)))
      if (!anyOpenConsole) {
        return res.status(409).json({ error: 'Selected slot is unavailable.' })
      }
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('Gaming precheck error:', err)
    return res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// POST /api/gaming/book — book a gaming slot
// Body: { venue_id, date, setup_type, game_id?, player_count, slot_start_minutes, payment_ref }
// ─────────────────────────────────────────────────────────────
router.post('/book', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })

  const { venue_id, date, setup_type, game_id, player_count, slot_start_minutes, slot_start_minutes_list, payment_ref, wallet_request_id } = req.body

  // Support both single slot (legacy) and multi-slot
  const slotList = toSlotList(slot_start_minutes, slot_start_minutes_list)

  if (!venue_id || !date || !setup_type || !slotList.length) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get setup
    const { rows: setupRows } = await client.query(
      'SELECT * FROM gaming_setups WHERE venue_id = $1 AND setup_type = $2',
      [venue_id, setup_type]
    )
    if (!setupRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Gaming setup not found' })
    }
    const setup = setupRows[0]
    const duration = setup.slot_duration_minutes

    for (const startMins of slotList) {
      const isExclusiveOpen = await ensureExclusiveGamingSlotAvailable(client, {
        venueId: venue_id,
        date,
        setupId: setup.id,
        slotStartMinutes: Number(startMins),
      })
      if (!isExclusiveOpen) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'One or more selected slots are no longer available.' })
      }
    }

    // Get eligible consoles (with FOR UPDATE to prevent race conditions)
    let consoles
    if (game_id && setup_type === 'ps5') {
      const { rows } = await client.query(`
        SELECT gc.* FROM gaming_consoles gc
        JOIN gaming_console_games gcg ON gcg.console_id = gc.id
        WHERE gc.setup_id = $1 AND gcg.game_id = $2
        ORDER BY gc.console_number
        FOR UPDATE OF gc
      `, [setup.id, game_id])
      consoles = rows
    } else {
      const { rows } = await client.query(
        'SELECT * FROM gaming_consoles WHERE setup_id = $1 ORDER BY console_number FOR UPDATE',
        [setup.id]
      )
      consoles = rows
    }

    if (!consoles.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No consoles available for this game' })
    }

    // Calculate per-slot price
    let pricePerSlot = 0
    const pc = player_count || 1
    if (setup_type === 'ps5') {
      const { rows: pricingRows } = await client.query(
        'SELECT price FROM gaming_ps5_pricing WHERE setup_id = $1 AND player_count = $2',
        [setup.id, pc]
      )
      if (!pricingRows.length) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `No pricing configured for ${pc} player(s)` })
      }
      pricePerSlot = parseFloat(pricingRows[0].price)
    } else {
      pricePerSlot = parseFloat(setup.price_per_session) || 0
    }

    // Get game name
    let gameName = null
    if (game_id) {
      const { rows: gameRows } = await client.query('SELECT name FROM gaming_games WHERE id = $1', [game_id])
      gameName = gameRows[0]?.name || null
    }

    const fmtTime = (mins) => {
      const h = Math.floor(mins / 60), m = mins % 60
      const period = h >= 12 ? 'PM' : 'AM'
      const display = h > 12 ? h - 12 : h === 0 ? 12 : h
      return m === 0 ? `${display}:00 ${period}` : `${display}:${String(m).padStart(2, '0')} ${period}`
    }

    const consoleIds = consoles.map(c => c.id)
    const allSlotIds = []
    const allSlotLabels = []
    const assignedConsoles = []

    // Process each slot
    for (const startMins of slotList) {
      // Find which consoles are already booked for this slot
      const { rows: booked } = await client.query(`
        SELECT gbd.console_id FROM gaming_booking_details gbd
        JOIN bookings b ON b.id = gbd.booking_id
        WHERE gbd.console_id = ANY($1)
          AND gbd.slot_date = $2
          AND gbd.slot_start_minutes = $3
          AND b.status = 'confirmed'
      `, [consoleIds, date, startMins])

      const bookedIds = new Set(booked.map(b => b.console_id))

      // Also check blocked slots
      const { rows: blockedSlots } = await client.query(`
        SELECT court_number FROM slots
        WHERE venue_id = $1 AND slot_date = $2 AND slot_start_minutes = $3 AND status = 'blocked'
      `, [venue_id, date, startMins])
      const blockedNums = new Set(blockedSlots.map(s => s.court_number))

      // Find first available console
      const availableConsole = consoles.find(c => !bookedIds.has(c.id) && !blockedNums.has(c.console_number))
      if (!availableConsole) {
        await client.query('ROLLBACK')
        const timeLabel = `${fmtTime(startMins)} – ${fmtTime(startMins + duration)}`
        return res.status(409).json({ error: `All consoles are booked for ${timeLabel}. Please remove that slot and try again.` })
      }

      assignedConsoles.push(availableConsole)

      // Format label
      const timeLabel = `${fmtTime(startMins)} – ${fmtTime(startMins + duration)}`
      const slotLabel = gameName
        ? `${gameName} · ${availableConsole.label} · ${timeLabel}`
        : `${availableConsole.label} · ${timeLabel}`
      allSlotLabels.push(slotLabel)

      // Create slot row in standard slots table (for compatibility)
      const hourStart = startMins % 60 === 0 ? startMins / 60 : null
      const { rows: slotRows } = await client.query(`
        INSERT INTO slots (
          venue_id, slot_date, court_number, slot_start_minutes,
          slot_duration_minutes, hour_start,
          status, total_capacity, booked_count, booked_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'booked', 1, 1, $7)
        ON CONFLICT DO NOTHING
        RETURNING *
      `, [venue_id, date, availableConsole.console_number, startMins, duration, hourStart, req.profile.id])

      let slotId
      if (slotRows.length) {
        slotId = slotRows[0].id
      } else {
        const { rows: existingSlot } = await client.query(`
          SELECT id, booked_count, total_capacity FROM slots
          WHERE venue_id = $1 AND slot_date = $2 AND court_number = $3 AND slot_start_minutes = $4
          FOR UPDATE
        `, [venue_id, date, availableConsole.console_number, startMins])
        if (existingSlot.length) {
          const es = existingSlot[0]
          await client.query(`
            UPDATE slots SET booked_count = $1, status = 'booked', booked_by = $2, updated_at = NOW() WHERE id = $3
          `, [es.booked_count + 1, req.profile.id, es.id])
          slotId = es.id
        }
      }
      if (slotId) allSlotIds.push(slotId)
    }

    // Create booking (single booking for all slots)
    const totalPrice = roundMoney(pricePerSlot * slotList.length)
    const coinSummary = wallet_request_id
      ? await getCheckoutCoinsSummary(client, {
        profile: req.profile,
        requestId: wallet_request_id,
      })
      : { applied_rc: 0, applied_inr: 0 }

    const appliedCoinsRc = roundMoney(coinSummary.applied_rc || 0)
    const appliedCoinsInr = roundMoney(coinSummary.applied_inr || 0)
    const payableAmount = roundMoney(Math.max(totalPrice - appliedCoinsInr, 0))

    const { rows: bookingRows } = await client.query(`
      INSERT INTO bookings (
        user_id, venue_id, slot_ids, booking_date,
        slots_label, subtotal, platform_fee, total_amount,
        status, payment_status, payment_ref, wallet_redemption_rc
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', 'paid', $9, $10)
      RETURNING *
    `, [
      req.profile.id, venue_id, allSlotIds,
      date, allSlotLabels, totalPrice, 0, payableAmount, payment_ref, appliedCoinsRc,
    ])

    if (wallet_request_id) {
      await confirmCheckoutCoins(client, {
        profile: req.profile,
        bookingId: bookingRows[0].id,
        requestId: wallet_request_id,
      })
    }

    // Create gaming booking detail rows (one per slot)
    for (let i = 0; i < slotList.length; i++) {
      await client.query(`
        INSERT INTO gaming_booking_details (
          booking_id, setup_type, game_id, game_name,
          console_id, console_label, player_count,
          price, slot_date, slot_start_minutes, slot_duration_minutes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        bookingRows[0].id, setup_type, game_id || null, gameName,
        assignedConsoles[i].id, assignedConsoles[i].label, pc,
        pricePerSlot, date, slotList[i], duration,
      ])
    }

    await processBookingWalletEvent(client, bookingRows[0], req.profile)

    await client.query('COMMIT')

    // Fetch venue info for response
    const { rows: venueInfo } = await pool.query(
      `SELECT v.name, v.sport_icon, v.city FROM venues v WHERE v.id = $1`, [venue_id]
    )

    res.json({
      ...bookingRows[0],
      venues: venueInfo[0] || null,
      gaming: {
        setup_type, game_name: gameName,
        console_labels: assignedConsoles.map(c => c.label),
        player_count: pc,
        price_per_slot: pricePerSlot,
        total_price: totalPrice,
        payable_amount: payableAmount,
        applied_coins_rc: appliedCoinsRc,
        slot_count: slotList.length,
        duration,
      }
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Gaming booking error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/gaming/my-bookings?venue_id=&date= — user's gaming bookings
// ─────────────────────────────────────────────────────────────
router.get('/my-bookings', requireAuth, loadProfile, async (req, res) => {
  if (!req.profile) return res.json([])
  const { venue_id, date } = req.query
  if (!venue_id || !date) return res.status(400).json({ error: 'venue_id and date required' })

  try {
    const { rows } = await pool.query(`
      SELECT gbd.* FROM gaming_booking_details gbd
      JOIN bookings b ON b.id = gbd.booking_id
      WHERE b.user_id = $1 AND b.venue_id = $2 AND gbd.slot_date = $3 AND b.status = 'confirmed'
    `, [req.profile.id, venue_id, date])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
