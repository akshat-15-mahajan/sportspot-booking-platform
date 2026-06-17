import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import {
  applyCoinsAtCheckout,
  confirmCheckoutCoins,
  getCheckoutCoinsSummary,
  getWalletBalance,
  getWalletProgress,
  getWalletProgressAndBalance,
  listWalletMissions,
  listWalletTransactions,
  releaseCheckoutCoins,
} from '../lib/wallet.js'

const router = Router()

router.use(requireAuth, loadProfile)

router.get('/balance', async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
  try {
    const [progress, balance] = await Promise.all([
      getWalletProgress(req.app.locals.pool || pool, req.profile.id),
      getWalletBalance(req.app.locals.pool || pool, req.profile.id),
    ])

    res.json({
      progress,
      balance,
      rc_value_inr: 0.1,
      rc_per_inr: 10,
      expiry_days: 15,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/transactions', async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
  try {
    const limit = Number(req.query.limit || 50)
    const rows = await listWalletTransactions(req.app.locals.pool || pool, req.profile.id, limit)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/progress', async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
  try {
    const payload = await getWalletProgressAndBalance(req.app.locals.pool || pool, req.profile.id)
    res.json(payload)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/missions', async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
  try {
    const missions = await listWalletMissions(req.app.locals.pool || pool, req.profile.id)
    res.json(missions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/apply-coins', async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })

  const bookingAmountInr = Number(req.body.booking_amount_inr ?? req.body.bookingAmountInr)
  const bookingId = req.body.booking_id || req.body.bookingId
  const requestId = req.body.request_id || req.body.requestId
  const requestedRc = req.body.requested_rc ?? req.body.requestedRc

  if (!bookingId && !requestId) {
    return res.status(400).json({ error: 'booking_id or request_id is required for idempotent checkout coin application' })
  }

  try {
    const result = await applyCoinsAtCheckout(req.app.locals.pool || pool, {
      profile: req.profile,
      bookingAmountInr,
      bookingId,
      requestId,
      requestedRc: requestedRc == null ? null : Number(requestedRc),
    })

    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/checkout-summary', async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })

  const bookingId = req.body.booking_id || req.body.bookingId
  const requestId = req.body.request_id || req.body.requestId

  if (!bookingId && !requestId) {
    return res.status(400).json({ error: 'booking_id or request_id is required' })
  }

  try {
    const result = await getCheckoutCoinsSummary(req.app.locals.pool || pool, {
      profile: req.profile,
      bookingId,
      requestId,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/confirm-coins', async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })

  const bookingId = req.body.booking_id || req.body.bookingId
  const requestId = req.body.request_id || req.body.requestId

  if (!bookingId) {
    return res.status(400).json({ error: 'booking_id is required' })
  }

  try {
    const result = await confirmCheckoutCoins(req.app.locals.pool || pool, {
      profile: req.profile,
      bookingId,
      requestId,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/release-coins', async (req, res) => {
  if (!req.profile) return res.status(403).json({ error: 'Profile not found' })

  const bookingId = req.body.booking_id || req.body.bookingId
  const requestId = req.body.request_id || req.body.requestId

  if (!bookingId && !requestId) {
    return res.status(400).json({ error: 'booking_id or request_id is required' })
  }

  try {
    const result = await releaseCheckoutCoins(req.app.locals.pool || pool, {
      profile: req.profile,
      bookingId,
      requestId,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
