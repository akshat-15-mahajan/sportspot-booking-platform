import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'
import { processSignupWalletEvent } from '../lib/wallet.js'

const router = Router()

// GET /api/profile — get current user's profile
router.get('/', requireAuth, loadProfile, (req, res) => {
  res.json(req.profile || null)
})

// POST /api/profile — create or upsert profile
router.post('/', requireAuth, async (req, res) => {
  const { full_name, email, phone, city, role, referral_code } = req.body
  try {
    const { rows } = await pool.query(`
      INSERT INTO profiles (clerk_id, email, full_name, phone, city, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (clerk_id) DO UPDATE SET
        email     = COALESCE(EXCLUDED.email, profiles.email),
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        phone     = COALESCE(EXCLUDED.phone, profiles.phone),
        city      = COALESCE(EXCLUDED.city, profiles.city),
        role      = COALESCE(EXCLUDED.role, profiles.role),
        updated_at = NOW()
      RETURNING *
    `, [req.clerkUserId, email || null, full_name || null, phone || null, city || null, role || 'user'])
    const profile = rows[0]
    const walletProfile = await processSignupWalletEvent(pool, profile, {
      referralCode: referral_code || null,
    })
    res.json(walletProfile)
  } catch (err) {
    console.error('Profile upsert error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
