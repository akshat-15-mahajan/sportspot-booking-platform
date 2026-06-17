import { Router } from 'express'
import { put, del } from '@vercel/blob'
import { pool } from '../db.js'
import { requireAuth, loadProfile } from '../middleware/auth.js'

const router = Router()

// POST /api/upload/venue-photo/:venueId — upload photos via JSON base64
// Frontend sends: { files: [{ name, type, base64 }, ...] }
// No multer/FormData needed — works perfectly on Vercel serverless
router.post('/venue-photo/:venueId', requireAuth, loadProfile, async (req, res) => {
  const { venueId } = req.params
  try {
    const { files } = req.body
    if (!files || !files.length) return res.status(400).json({ error: 'No files provided' })

    // Verify ownership or admin
    const { rows: venue } = await pool.query('SELECT owner_id, images FROM venues WHERE id = $1', [venueId])
    if (!venue.length) return res.status(404).json({ error: 'Venue not found' })
    if (venue[0].owner_id !== req.profile.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    const existingImages = venue[0].images || []
    const newUrls = []

    for (const file of files.slice(0, 6 - existingImages.length)) {
      if (!allowed.includes(file.type)) continue
      const buffer = Buffer.from(file.base64, 'base64')
      if (buffer.length > 5 * 1024 * 1024) continue // skip >5MB

      const ext = file.name.split('.').pop() || 'jpg'
      const blobPath = `venue-photos/${venueId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const blob = await put(blobPath, buffer, {
        access: 'public',
        contentType: file.type,
      })
      newUrls.push(blob.url)
    }

    const allImages = [...existingImages, ...newUrls].slice(0, 6)

    await pool.query(
      'UPDATE venues SET images = $1, updated_at = NOW() WHERE id = $2',
      [allImages, venueId]
    )

    res.json({ images: allImages, uploaded: newUrls })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/upload/venue-photo/:venueId — remove a photo
router.delete('/venue-photo/:venueId', requireAuth, loadProfile, async (req, res) => {
  const { venueId } = req.params
  const { url } = req.body
  try {
    const { rows: venue } = await pool.query('SELECT owner_id, images FROM venues WHERE id = $1', [venueId])
    if (!venue.length) return res.status(404).json({ error: 'Venue not found' })
    if (venue[0].owner_id !== req.profile.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // Delete from Vercel Blob
    if (url && url.includes('blob.vercel-storage.com')) {
      try { await del(url) } catch { /* best effort */ }
    }

    const newImages = (venue[0].images || []).filter(img => img !== url)
    await pool.query(
      'UPDATE venues SET images = $1, updated_at = NOW() WHERE id = $2',
      [newImages, venueId]
    )

    res.json({ images: newImages })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/upload/game-cover — upload a game cover photo (base64)
// Frontend sends: { file: { name, type, base64 }, venue_id, game_index }
router.post('/game-cover', requireAuth, loadProfile, async (req, res) => {
  try {
    const { file, venue_id } = req.body
    if (!file || !venue_id) return res.status(400).json({ error: 'File and venue_id required' })

    // Verify ownership or admin
    const { rows: venue } = await pool.query('SELECT owner_id FROM venues WHERE id = $1', [venue_id])
    if (!venue.length) return res.status(404).json({ error: 'Venue not found' })
    if (venue[0].owner_id !== req.profile.id && req.profile.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) return res.status(400).json({ error: 'Invalid file type' })

    const buffer = Buffer.from(file.base64, 'base64')
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 5MB)' })

    const ext = file.name.split('.').pop() || 'jpg'
    const blobPath = `game-covers/${venue_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const blob = await put(blobPath, buffer, {
      access: 'public',
      contentType: file.type,
    })

    res.json({ url: blob.url })
  } catch (err) {
    console.error('Game cover upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
