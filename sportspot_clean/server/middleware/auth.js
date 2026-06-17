import { getAuth } from '@clerk/express'
import { pool } from '../db.js'

// Extracts Clerk userId from JWT and attaches to req
export function requireAuth(req, res, next) {
  const { userId } = getAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  req.clerkUserId = userId
  next()
}

// Optionally extracts auth (doesn't fail if missing)
export function optionalAuth(req, res, next) {
  try {
    const { userId } = getAuth(req)
    req.clerkUserId = userId || null
  } catch {
    req.clerkUserId = null
  }
  next()
}

// Loads the profile row for the authenticated user
export async function loadProfile(req, res, next) {
  if (!req.clerkUserId) return next()
  try {
    const { rows } = await pool.query(
      'SELECT * FROM profiles WHERE clerk_id = $1',
      [req.clerkUserId]
    )
    req.profile = rows[0] || null
  } catch (err) {
    console.error('Profile load error:', err)
    req.profile = null
  }
  next()
}

// Requires a specific role (call after loadProfile)
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.profile) return res.status(403).json({ error: 'Profile not found' })
    if (!roles.includes(req.profile.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}
