import { pool } from '../db.js'

const RC_PER_INR = 10
const RC_VALUE_INR = 0.1
const EXPIRY_DAYS = 15

export const WALLET_LEVELS = [
  { code: 'rookie', minXp: 0, multiplier: 1.0 },
  { code: 'bronze', minXp: 200, multiplier: 1.05 },
  { code: 'silver', minXp: 700, multiplier: 1.1 },
  { code: 'champion', minXp: 1500, multiplier: 1.2 },
]

export const DEFAULT_WALLET_CONFIG = {
  signupBonusRc: 50,
  bookingRcPerInr: 1,
  referralReferrerBonusRc: 100,
  referralReferredBonusRc: 50,
  streakBonusRc: 75,
  milestoneBonuses: {
    5: 100,
    10: 250,
    25: 750,
  },
}

export const DEFAULT_MISSIONS = [
  {
    code: 'weekly_3_bookings',
    title: 'Weekend Warrior',
    description: 'Complete 3 bookings in a week.',
    mission_type: 'weekly',
    trigger_event: 'booking_completed',
    target_count: 3,
    rc_reward: 75,
    xp_reward: 75,
    reset_policy: 'calendar_week',
    sort_order: 10,
  },
  {
    code: 'weekly_5_bookings',
    title: 'Momentum Maker',
    description: 'Complete 5 bookings in a week.',
    mission_type: 'weekly',
    trigger_event: 'booking_completed',
    target_count: 5,
    rc_reward: 150,
    xp_reward: 150,
    reset_policy: 'calendar_week',
    sort_order: 20,
  },
  {
    code: 'first_booking',
    title: 'First Light',
    description: 'Complete your first booking.',
    mission_type: 'one_time',
    trigger_event: 'booking_completed',
    target_count: 1,
    rc_reward: 50,
    xp_reward: 50,
    reset_policy: 'one_time',
    sort_order: 30,
  },
  {
    code: 'five_bookings',
    title: 'Regular',
    description: 'Complete 5 total bookings.',
    mission_type: 'one_time',
    trigger_event: 'booking_completed',
    target_count: 5,
    rc_reward: 100,
    xp_reward: 100,
    reset_policy: 'one_time',
    sort_order: 40,
  },
  {
    code: 'ten_bookings',
    title: 'Streak Builder',
    description: 'Complete 10 total bookings.',
    mission_type: 'one_time',
    trigger_event: 'booking_completed',
    target_count: 10,
    rc_reward: 250,
    xp_reward: 250,
    reset_policy: 'one_time',
    sort_order: 50,
  },
  {
    code: 'twentyfive_bookings',
    title: 'Champion Path',
    description: 'Complete 25 total bookings.',
    mission_type: 'one_time',
    trigger_event: 'booking_completed',
    target_count: 25,
    rc_reward: 750,
    xp_reward: 750,
    reset_policy: 'one_time',
    sort_order: 60,
  },
]

function q(client, text, params = []) {
  return (client || pool).query(text, params)
}

function isWalletSchemaError(err) {
  const code = String(err?.code || '')
  const message = String(err?.message || '')
  if (!['42703', '42P01'].includes(code)) return false
  return /(wallet_|wallet_transactions|missions|mission_progress|referrals)/i.test(message)
}

async function getBasicWalletProfile(client, profileId) {
  const { rows } = await q(client, `
    SELECT id, role, full_name, email, city, created_at, updated_at
    FROM profiles
    WHERE id = $1
  `, [profileId])

  const base = rows[0] || null
  if (!base) return null

  return {
    ...base,
    wallet_referral_code: null,
    wallet_level: 'rookie',
    wallet_xp: 0,
    wallet_streak_days: 0,
    wallet_last_booking_date: null,
    wallet_week_start_date: null,
    wallet_week_booking_count: 0,
    wallet_total_bookings: 0,
    wallet_total_rc_earned: 0,
    wallet_total_rc_spent: 0,
  }
}

function roundRc(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function toDateOnly(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getWeekStartDate(value = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return date.toISOString().slice(0, 10)
}

export function getWalletLevel(xp = 0) {
  const currentXp = Number(xp) || 0
  return WALLET_LEVELS.reduce((current, level) => (currentXp >= level.minXp ? level : current), WALLET_LEVELS[0])
}

export function generateReferralCode(profile) {
  const base = String(profile?.clerk_id || profile?.id || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10)
    .toUpperCase()
  return `RB${base || Math.random().toString(36).slice(2, 10).toUpperCase()}`
}

export async function ensureWalletReferralCode(client, profile) {
  if (!profile?.id) return profile
  if (profile.wallet_referral_code) return profile

  const referralCode = generateReferralCode(profile)
  let rows = []
  try {
    const result = await q(client, `
      UPDATE profiles
      SET wallet_referral_code = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [profile.id, referralCode])
    rows = result.rows
  } catch (err) {
    if (!isWalletSchemaError(err)) throw err
  }

  return rows[0] || { ...profile, wallet_referral_code: referralCode }
}

export async function ensureMissionCatalog(client) {
  const rows = []
  for (const mission of DEFAULT_MISSIONS) {
    const { rows: inserted } = await q(client, `
      INSERT INTO missions (
        code, title, description, mission_type, trigger_event,
        target_count, rc_reward, xp_reward, active, reset_policy, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10)
      ON CONFLICT (code) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        mission_type = EXCLUDED.mission_type,
        trigger_event = EXCLUDED.trigger_event,
        target_count = EXCLUDED.target_count,
        rc_reward = EXCLUDED.rc_reward,
        xp_reward = EXCLUDED.xp_reward,
        active = EXCLUDED.active,
        reset_policy = EXCLUDED.reset_policy,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
      RETURNING *
    `, [
      mission.code,
      mission.title,
      mission.description,
      mission.mission_type,
      mission.trigger_event,
      mission.target_count,
      mission.rc_reward,
      mission.xp_reward,
      mission.reset_policy,
      mission.sort_order,
    ])
    if (inserted[0]) rows.push(inserted[0])
  }
  return rows
}

export async function getWalletBalance(client, profileId) {
  try {
    const { rows } = await q(client, `
      SELECT
        COALESCE(SUM(remaining_rc) FILTER (WHERE remaining_rc > 0 AND expires_at > NOW()), 0) AS available_rc,
        COALESCE(SUM(remaining_rc) FILTER (WHERE remaining_rc > 0), 0) AS total_active_rc,
        COALESCE(SUM(rc_amount) FILTER (WHERE transaction_type <> 'redemption'), 0) AS total_earned_rc,
        COALESCE(SUM(rc_amount) FILTER (WHERE transaction_type = 'redemption'), 0) AS total_spent_rc,
        COUNT(*) FILTER (WHERE remaining_rc > 0 AND expires_at <= NOW()) AS expired_lots
      FROM wallet_transactions
      WHERE profile_id = $1
    `, [profileId])

    return rows[0] || {
      available_rc: 0,
      total_active_rc: 0,
      total_earned_rc: 0,
      total_spent_rc: 0,
      expired_lots: 0,
    }
  } catch (err) {
    if (!isWalletSchemaError(err)) throw err
    return {
      available_rc: 0,
      total_active_rc: 0,
      total_earned_rc: 0,
      total_spent_rc: 0,
      expired_lots: 0,
    }
  }
}

export async function listWalletTransactions(client, profileId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  try {
    const { rows } = await q(client, `
      SELECT *
      FROM wallet_transactions
      WHERE profile_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [profileId, safeLimit])
    return rows
  } catch (err) {
    if (!isWalletSchemaError(err)) throw err
    return []
  }
}

export async function listWalletMissions(client, profileId) {
  try {
    await ensureMissionCatalog(client)
    const { rows } = await q(client, `
      SELECT
        m.*,
        mp.progress_count,
        mp.completed_at,
        mp.claimed_at,
        mp.period_start,
        mp.period_end,
        CASE
          WHEN m.mission_type = 'weekly' AND mp.period_start IS NULL THEN $2::date
          WHEN m.mission_type = 'weekly' THEN mp.period_start
          ELSE DATE '1970-01-01'
        END AS effective_period_start
      FROM missions m
      LEFT JOIN mission_progress mp
        ON mp.mission_id = m.id
       AND mp.profile_id = $1
      WHERE m.active = TRUE
      ORDER BY m.sort_order ASC, m.target_count ASC
    `, [profileId, getWeekStartDate(new Date())])
    return rows
  } catch (err) {
    if (!isWalletSchemaError(err)) throw err
    return []
  }
}

export async function getWalletProgress(client, profileId) {
  try {
    const { rows } = await q(client, `
      SELECT
        id, role, full_name, email, city,
        wallet_referral_code,
        wallet_level,
        wallet_xp,
        wallet_streak_days,
        wallet_last_booking_date,
        wallet_week_start_date,
        wallet_week_booking_count,
        wallet_total_bookings,
        wallet_total_rc_earned,
        wallet_total_rc_spent,
        created_at,
        updated_at
      FROM profiles
      WHERE id = $1
    `, [profileId])
    return rows[0] || null
  } catch (err) {
    if (!isWalletSchemaError(err)) throw err
    return getBasicWalletProfile(client, profileId)
  }
}

function sanitizeReward(value) {
  return Math.max(0, roundRc(value))
}

async function creditWallet(client, {
  profile,
  transactionType,
  sourceType,
  sourceId,
  rcAmount,
  metadata = {},
  expiresAt = null,
}) {
  const amount = sanitizeReward(rcAmount)
  if (!profile?.id || amount <= 0) {
    return { profile, transaction: null, inserted: false }
  }

  const idempotencyKey = `${transactionType}:${sourceType}:${String(sourceId)}`
  const { rows } = await q(client, `
    INSERT INTO wallet_transactions (
      profile_id, transaction_type, source_type, source_id,
      rc_amount, remaining_rc, expires_at, metadata, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING *
  `, [
    profile.id,
    transactionType,
    sourceType,
    String(sourceId),
    amount,
    amount,
    expiresAt,
    JSON.stringify(metadata || {}),
    idempotencyKey,
  ])

  if (!rows.length) {
    return { profile, transaction: null, inserted: false }
  }

  const nextXp = roundRc(Number(profile.wallet_xp || 0) + amount)
  const nextLevel = getWalletLevel(nextXp).code
  const { rows: profileRows } = await q(client, `
    UPDATE profiles
    SET wallet_xp = $2,
        wallet_total_rc_earned = COALESCE(wallet_total_rc_earned, 0) + $3,
        wallet_level = $4,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [profile.id, nextXp, amount, nextLevel])

  return { profile: profileRows[0] || profile, transaction: rows[0], inserted: true }
}

export async function extendActiveCoinExpiry(client, profileId) {
  const { rowCount } = await q(client, `
    UPDATE wallet_transactions
    SET expires_at = NOW() + ($2 * INTERVAL '1 day'),
        updated_at = NOW()
    WHERE profile_id = $1
      AND remaining_rc > 0
      AND expires_at > NOW()
      AND transaction_type <> 'redemption'
  `, [profileId, EXPIRY_DAYS])
  return rowCount
}

export async function applyCoinsAtCheckout(client, {
  profile,
  bookingAmountInr,
  bookingId,
  requestId,
  requestedRc = null,
}) {
  const amountInr = Number(bookingAmountInr)
  if (!profile?.id) throw new Error('Profile is required')
  if (!Number.isFinite(amountInr) || amountInr <= 0) throw new Error('bookingAmountInr must be a positive number')
  if (!bookingId && !requestId) throw new Error('bookingId or requestId is required for checkout idempotency')

  const bookingRcValue = roundRc(amountInr * RC_PER_INR)
  const maxAllowedRc = roundRc(bookingRcValue * 0.5)
  const desiredRc = requestedRc == null ? maxAllowedRc : Math.min(roundRc(requestedRc), maxAllowedRc)

  const idempotencyKey = `checkout:${profile.id}:${bookingId || requestId}`
  const { rows: redemptionRows } = await q(client, `
    INSERT INTO wallet_transactions (
      profile_id, transaction_type, source_type, source_id,
      rc_amount, remaining_rc, metadata, idempotency_key
    ) VALUES ($1, 'redemption', 'checkout', $2, 0, 0, $3::jsonb, $4)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING *
  `, [
    profile.id,
    String(bookingId || requestId),
    JSON.stringify({
      booking_amount_inr: amountInr,
      requested_rc: desiredRc,
      status: 'pending',
    }),
    idempotencyKey,
  ])

  if (!redemptionRows.length) {
    const { rows: existingRows } = await q(client, `
      SELECT *
      FROM wallet_transactions
      WHERE idempotency_key = $1
      LIMIT 1
    `, [idempotencyKey])

    const existing = existingRows[0] || null
    return {
      applied_rc: roundRc(existing?.rc_amount || 0),
      applied_inr: roundRc((Number(existing?.rc_amount || 0)) * RC_VALUE_INR),
      booking_amount_inr: amountInr,
      max_allowed_rc: maxAllowedRc,
      available_rc: roundRc(existing?.rc_amount || 0),
      payable_inr: roundRc(amountInr - ((Number(existing?.rc_amount || 0)) * RC_VALUE_INR)),
      deductions: existing?.metadata?.deductions || [],
      duplicate: true,
    }
  }

  const redemptionRow = redemptionRows[0]

  const { rows: lots } = await q(client, `
    SELECT id, remaining_rc, expires_at, created_at
    FROM wallet_transactions
    WHERE profile_id = $1
      AND transaction_type <> 'redemption'
      AND remaining_rc > 0
      AND expires_at > NOW()
    ORDER BY expires_at ASC, created_at ASC, id ASC
    FOR UPDATE
  `, [profile.id])

  let remaining = desiredRc
  const deductions = []

  for (const lot of lots) {
    if (remaining <= 0) break
    const available = roundRc(lot.remaining_rc)
    if (available <= 0) continue
    const deduction = roundRc(Math.min(available, remaining))
    if (deduction <= 0) continue

    await q(client, `
      UPDATE wallet_transactions
      SET remaining_rc = GREATEST(remaining_rc - $2, 0),
          updated_at = NOW()
      WHERE id = $1
    `, [lot.id, deduction])

    deductions.push({
      transaction_id: lot.id,
      deducted_rc: deduction,
      expires_at: lot.expires_at,
    })
    remaining = roundRc(remaining - deduction)
  }

  const appliedRc = roundRc(desiredRc - remaining)
  if (appliedRc <= 0) {
    await q(client, `
      UPDATE wallet_transactions
      SET rc_amount = 0,
          metadata = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `, [redemptionRow.id, JSON.stringify({ booking_amount_inr: amountInr, deductions: [] })])

    return {
      applied_rc: 0,
      applied_inr: 0,
      booking_amount_inr: amountInr,
      max_allowed_rc: maxAllowedRc,
      available_rc: 0,
      payable_inr: roundRc(amountInr),
      deductions: [],
      exhausted: true,
    }
  }

  await q(client, `
    UPDATE wallet_transactions
    SET rc_amount = $2,
        metadata = $3::jsonb,
        updated_at = NOW()
    WHERE id = $1
  `, [
    redemptionRow.id,
    appliedRc,
    JSON.stringify({ booking_amount_inr: amountInr, requested_rc: desiredRc, deductions }),
  ])

  const { rows: profileRows } = await q(client, `
    UPDATE profiles
    SET wallet_total_rc_spent = COALESCE(wallet_total_rc_spent, 0) + $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [profile.id, appliedRc])

  return {
    applied_rc: appliedRc,
    applied_inr: roundRc(appliedRc * RC_VALUE_INR),
    booking_amount_inr: amountInr,
    max_allowed_rc: maxAllowedRc,
    available_rc: appliedRc,
    payable_inr: roundRc(amountInr - (appliedRc * RC_VALUE_INR)),
    deductions,
    profile: profileRows[0] || profile,
  }
}

function parseCheckoutDeductions(metadata) {
  const deductions = metadata?.deductions
  if (!Array.isArray(deductions)) return []
  return deductions
    .map(d => ({
      transaction_id: d?.transaction_id,
      deducted_rc: roundRc(d?.deducted_rc),
    }))
    .filter(d => d.transaction_id && d.deducted_rc > 0)
}

async function findCheckoutRedemptionRow(client, profileId, { bookingId = null, requestId = null, forUpdate = false } = {}) {
  const sourceIds = [bookingId, requestId].map(v => String(v || '').trim()).filter(Boolean)
  if (!profileId || !sourceIds.length) return null

  const lockSql = forUpdate ? 'FOR UPDATE' : ''
  const { rows } = await q(client, `
    SELECT *
    FROM wallet_transactions
    WHERE profile_id = $1
      AND transaction_type = 'redemption'
      AND source_type = 'checkout'
      AND source_id = ANY($2)
    ORDER BY created_at DESC
    LIMIT 1
    ${lockSql}
  `, [profileId, sourceIds])

  return rows[0] || null
}

export async function getCheckoutCoinsSummary(client, {
  profile,
  bookingId = null,
  requestId = null,
}) {
  if (!profile?.id) return { applied_rc: 0, applied_inr: 0, found: false }

  const row = await findCheckoutRedemptionRow(client, profile.id, { bookingId, requestId, forUpdate: false })
  if (!row) return { applied_rc: 0, applied_inr: 0, found: false }

  const status = row.metadata?.status || 'pending'
  if (status === 'released') {
    return { applied_rc: 0, applied_inr: 0, found: true, status }
  }

  const appliedRc = roundRc(row.rc_amount)
  return {
    applied_rc: appliedRc,
    applied_inr: roundRc(appliedRc * RC_VALUE_INR),
    found: true,
    status,
    transaction_id: row.id,
  }
}

export async function confirmCheckoutCoins(client, {
  profile,
  bookingId,
  requestId = null,
}) {
  if (!profile?.id || !bookingId) return { applied_rc: 0, applied_inr: 0, confirmed: false }

  const row = await findCheckoutRedemptionRow(client, profile.id, { bookingId, requestId, forUpdate: true })
  if (!row) return { applied_rc: 0, applied_inr: 0, confirmed: false }

  const status = row.metadata?.status || 'pending'
  if (status === 'released') return { applied_rc: 0, applied_inr: 0, confirmed: false, released: true }

  const appliedRc = roundRc(row.rc_amount)
  const nextMetadata = {
    ...(row.metadata || {}),
    status: 'applied',
    booking_id: String(bookingId),
    request_id: requestId ? String(requestId) : (row.metadata?.request_id || null),
    applied_at: new Date().toISOString(),
  }

  await q(client, `
    UPDATE wallet_transactions
    SET source_id = $2,
        metadata = $3::jsonb,
        updated_at = NOW()
    WHERE id = $1
  `, [row.id, String(bookingId), JSON.stringify(nextMetadata)])

  return {
    applied_rc: appliedRc,
    applied_inr: roundRc(appliedRc * RC_VALUE_INR),
    confirmed: true,
    status: 'applied',
    transaction_id: row.id,
  }
}

export async function releaseCheckoutCoins(client, {
  profile,
  bookingId = null,
  requestId = null,
}) {
  if (!profile?.id) return { released_rc: 0, released_inr: 0, released: false }

  const row = await findCheckoutRedemptionRow(client, profile.id, { bookingId, requestId, forUpdate: true })
  if (!row) return { released_rc: 0, released_inr: 0, released: false }

  const status = row.metadata?.status || 'pending'
  if (status === 'released') {
    return { released_rc: 0, released_inr: 0, released: true, duplicate: true }
  }
  if (status === 'applied') {
    return { released_rc: 0, released_inr: 0, released: false, already_applied: true }
  }

  const deductions = parseCheckoutDeductions(row.metadata)
  for (const deduction of deductions) {
    await q(client, `
      UPDATE wallet_transactions
      SET remaining_rc = COALESCE(remaining_rc, 0) + $2,
          updated_at = NOW()
      WHERE id = $1
        AND profile_id = $3
        AND transaction_type <> 'redemption'
    `, [deduction.transaction_id, deduction.deducted_rc, profile.id])
  }

  const releasedRc = roundRc(row.rc_amount)
  const nextMetadata = {
    ...(row.metadata || {}),
    status: 'released',
    released_at: new Date().toISOString(),
  }

  await q(client, `
    UPDATE wallet_transactions
    SET rc_amount = 0,
        metadata = $2::jsonb,
        updated_at = NOW()
    WHERE id = $1
  `, [row.id, JSON.stringify(nextMetadata)])

  if (releasedRc > 0) {
    await q(client, `
      UPDATE profiles
      SET wallet_total_rc_spent = GREATEST(COALESCE(wallet_total_rc_spent, 0) - $2, 0),
          updated_at = NOW()
      WHERE id = $1
    `, [profile.id, releasedRc])
  }

  return {
    released_rc: releasedRc,
    released_inr: roundRc(releasedRc * RC_VALUE_INR),
    released: true,
  }
}

async function completeMissionsForEvent(client, {
  profile,
  eventType,
  eventKey,
  weekStartDate,
  progressValue,
  levelMultiplier,
}) {
  await ensureMissionCatalog(client)

  const { rows: missions } = await q(client, `
    SELECT *
    FROM missions
    WHERE active = TRUE AND trigger_event = $1
    ORDER BY sort_order ASC, target_count ASC
  `, [eventType])

  const completedRewards = []

  for (const mission of missions) {
    const periodStart = mission.mission_type === 'weekly' ? weekStartDate : '1970-01-01'
    const periodEnd = mission.mission_type === 'weekly' ? addDays(weekStartDate, 6) : '9999-12-31'
    const currentProgress = mission.mission_type === 'weekly' ? progressValue.weekBookingCount : progressValue.totalBookings

    const { rows: progressRows } = await q(client, `
      INSERT INTO mission_progress (
        profile_id, mission_id, period_start, period_end,
        progress_count, source_event_key, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (profile_id, mission_id, period_start) DO UPDATE SET
        progress_count = EXCLUDED.progress_count,
        source_event_key = EXCLUDED.source_event_key,
        metadata = COALESCE(mission_progress.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `, [
      profile.id,
      mission.id,
      periodStart,
      periodEnd,
      currentProgress,
      eventKey,
      JSON.stringify({ event_type: eventType }),
    ])

    const progress = progressRows[0]
    if (!progress || progress.completed_at || Number(progress.progress_count || 0) < Number(mission.target_count || 0)) {
      continue
    }

    await q(client, `
      UPDATE mission_progress
      SET completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
      WHERE id = $1 AND completed_at IS NULL
    `, [progress.id])

    const rewardRc = roundRc(Number(mission.rc_reward || 0) * levelMultiplier)
    if (rewardRc > 0) {
      const rewardResult = await creditWallet(client, {
        profile,
        transactionType: 'mission_reward',
        sourceType: 'mission',
        sourceId: `${mission.code}:${periodStart}`,
        rcAmount: rewardRc,
        metadata: {
          mission_code: mission.code,
          mission_type: mission.mission_type,
          target_count: mission.target_count,
          event_key: eventKey,
        },
      })
      if (rewardResult.inserted) {
        profile = rewardResult.profile
        completedRewards.push({ mission_code: mission.code, rc_reward: rewardRc })
      }
    }
  }

  return { profile, completedRewards }
}

export async function processSignupWalletEvent(client, profile, { referralCode = null } = {}) {
  if (!profile?.id) throw new Error('Profile is required')
  let workingProfile = await ensureWalletReferralCode(client, profile)

  const signupResult = await creditWallet(client, {
    profile: workingProfile,
    transactionType: 'signup_bonus',
    sourceType: 'signup',
    sourceId: workingProfile.id,
    rcAmount: DEFAULT_WALLET_CONFIG.signupBonusRc,
    metadata: {
      event: 'signup',
      referral_code: referralCode || null,
    },
  })
  workingProfile = signupResult.profile || workingProfile

  if (referralCode) {
    const { rows: referrers } = await q(client, `
      SELECT id, wallet_referral_code, wallet_xp, wallet_level
      FROM profiles
      WHERE wallet_referral_code = $1
      LIMIT 1
    `, [String(referralCode).trim().toUpperCase()])

    if (referrers[0] && referrers[0].id !== workingProfile.id) {
      await q(client, `
        INSERT INTO referrals (
          referral_code, referrer_profile_id, referee_profile_id, status, metadata
        ) VALUES ($1, $2, $3, 'pending', $4::jsonb)
        ON CONFLICT (referee_profile_id) DO NOTHING
      `, [
        `RF-${workingProfile.id}`,
        referrers[0].id,
        workingProfile.id,
        JSON.stringify({ source: 'signup' }),
      ])
    }
  }

  return workingProfile
}

export async function processReferralCompletion(client, profile, { bookingId = null } = {}) {
  if (!profile?.id) throw new Error('Profile is required')

  const { rows: referralRows } = await q(client, `
    SELECT *
    FROM referrals
    WHERE referee_profile_id = $1
      AND status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE
  `, [profile.id])

  const referral = referralRows[0]
  if (!referral) return { profile, referral: null }

  await q(client, `
    UPDATE referrals
    SET status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
        updated_at = NOW()
    WHERE id = $1 AND status = 'pending'
  `, [referral.id, JSON.stringify({ booking_id: bookingId })])

  const { rows: referrerRows } = await q(client, `
    SELECT * FROM profiles WHERE id = $1 LIMIT 1
  `, [referral.referrer_profile_id])

  let workingProfile = profile
  let workingReferrer = referrerRows[0] || null

  if (workingReferrer) {
    const referrerResult = await creditWallet(client, {
      profile: workingReferrer,
      transactionType: 'referral_bonus',
      sourceType: 'referral',
      sourceId: referral.id,
      rcAmount: DEFAULT_WALLET_CONFIG.referralReferrerBonusRc,
      metadata: { referral_id: referral.id, role: 'referrer' },
    })
    workingReferrer = referrerResult.profile || workingReferrer
  }

  const refereeResult = await creditWallet(client, {
    profile: workingProfile,
    transactionType: 'referral_bonus',
    sourceType: 'referral',
    sourceId: `${referral.id}:referee`,
    rcAmount: DEFAULT_WALLET_CONFIG.referralReferredBonusRc,
    metadata: { referral_id: referral.id, role: 'referee' },
  })

  workingProfile = refereeResult.profile || workingProfile

  return {
    profile: workingProfile,
    referrer: workingReferrer,
    referral,
  }
}

export async function processBookingWalletEvent(client, booking, profile) {
  if (!booking?.id || !profile?.id) throw new Error('booking and profile are required')

  const { rows: bookingLockRows } = await q(client, `
    UPDATE bookings
    SET wallet_processed_at = COALESCE(wallet_processed_at, NOW()),
        wallet_event_key = COALESCE(wallet_event_key, $2),
        updated_at = NOW()
    WHERE id = $1 AND wallet_processed_at IS NULL
    RETURNING *
  `, [booking.id, `booking:${booking.id}`])

  if (!bookingLockRows.length) {
    return { profile, booking, skipped: true }
  }

  const bookingDate = toDateOnly(booking.booking_date)
  const weekStartDate = getWeekStartDate(bookingDate || new Date())
  const baseMultiplier = getWalletLevel(profile.wallet_xp || 0).multiplier

  await extendActiveCoinExpiry(client, profile.id)

  const { rows: progressRows } = await q(client, `
    UPDATE profiles
    SET wallet_total_bookings = COALESCE(wallet_total_bookings, 0) + 1,
        wallet_last_booking_date = $2::date,
        wallet_week_start_date = CASE
          WHEN wallet_week_start_date IS DISTINCT FROM $3::date THEN $3::date
          ELSE wallet_week_start_date
        END,
        wallet_week_booking_count = CASE
          WHEN wallet_week_start_date IS DISTINCT FROM $3::date THEN 1
          ELSE COALESCE(wallet_week_booking_count, 0) + 1
        END,
        wallet_streak_days = CASE
          WHEN wallet_last_booking_date IS NULL THEN 1
          WHEN $2::date - wallet_last_booking_date <= 7 THEN LEAST(COALESCE(wallet_streak_days, 0) + 1, 7)
          ELSE 1
        END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [profile.id, bookingDate, weekStartDate])

  let workingProfile = progressRows[0] || profile
  const streakDays = Number(workingProfile.wallet_streak_days || 0)
  const totalBookings = Number(workingProfile.wallet_total_bookings || 0)
  const weekBookingCount = Number(workingProfile.wallet_week_booking_count || 0)

  const bookingRewardRc = roundRc(Number(booking.total_amount || 0) * DEFAULT_WALLET_CONFIG.bookingRcPerInr * baseMultiplier)
  if (bookingRewardRc > 0) {
    const result = await creditWallet(client, {
      profile: workingProfile,
      transactionType: 'booking_reward',
      sourceType: 'booking',
      sourceId: booking.id,
      rcAmount: bookingRewardRc,
      metadata: {
        booking_id: booking.id,
        booking_date: bookingDate,
        total_amount_inr: booking.total_amount,
      },
    })
    workingProfile = result.profile || workingProfile
  }

  await q(client, `
    UPDATE bookings
    SET wallet_reward_rc = $2,
        wallet_redemption_rc = COALESCE(wallet_redemption_rc, 0),
        updated_at = NOW()
    WHERE id = $1
  `, [booking.id, bookingRewardRc])

  if (streakDays > 0 && streakDays % 7 === 0) {
    const streakRewardRc = roundRc(DEFAULT_WALLET_CONFIG.streakBonusRc * baseMultiplier)
    if (streakRewardRc > 0) {
      const result = await creditWallet(client, {
        profile: workingProfile,
        transactionType: 'streak_bonus',
        sourceType: 'streak',
        sourceId: `${booking.id}:${streakDays}`,
        rcAmount: streakRewardRc,
        metadata: {
          booking_id: booking.id,
          streak_days: streakDays,
        },
      })
      workingProfile = result.profile || workingProfile
    }
  }

  const milestoneBonuses = DEFAULT_WALLET_CONFIG.milestoneBonuses
  for (const milestone of [5, 10, 25]) {
    if (totalBookings !== milestone) continue
    const milestoneRewardRc = roundRc(Number(milestoneBonuses[milestone] || 0) * baseMultiplier)
    if (milestoneRewardRc <= 0) continue
    const result = await creditWallet(client, {
      profile: workingProfile,
      transactionType: 'milestone_bonus',
      sourceType: 'milestone',
      sourceId: `${booking.id}:booking-${milestone}`,
      rcAmount: milestoneRewardRc,
      metadata: {
        booking_id: booking.id,
        milestone,
      },
    })
    workingProfile = result.profile || workingProfile
  }

  const { profile: missionProfile, completedRewards } = await completeMissionsForEvent(client, {
    profile: workingProfile,
    eventType: 'booking_completed',
    eventKey: booking.id,
    weekStartDate,
    progressValue: {
      totalBookings,
      weekBookingCount,
    },
    levelMultiplier: baseMultiplier,
  })

  workingProfile = missionProfile || workingProfile

  const referralResult = await processReferralCompletion(client, workingProfile, { bookingId: booking.id })
  workingProfile = referralResult.profile || workingProfile

  return {
    profile: workingProfile,
    booking,
    bookingRewardRc,
    completedRewards,
    referral: referralResult.referral || null,
  }
}

export async function getWalletProgressAndBalance(client, profileId) {
  let progress = null
  let balance = null
  let transactions = []
  let missions = []

  try {
    ;[progress, balance, transactions, missions] = await Promise.all([
      getWalletProgress(client, profileId),
      getWalletBalance(client, profileId),
      listWalletTransactions(client, profileId, 25),
      listWalletMissions(client, profileId),
    ])
  } catch (err) {
    if (!isWalletSchemaError(err)) throw err
    progress = await getBasicWalletProfile(client, profileId)
    balance = {
      available_rc: 0,
      total_active_rc: 0,
      total_earned_rc: 0,
      total_spent_rc: 0,
      expired_lots: 0,
    }
    transactions = []
    missions = []
  }

  return {
    progress,
    balance,
    transactions,
    missions,
    rc_value_inr: RC_VALUE_INR,
    rc_per_inr: RC_PER_INR,
    expiry_days: EXPIRY_DAYS,
    level_multipliers: WALLET_LEVELS,
  }
}
