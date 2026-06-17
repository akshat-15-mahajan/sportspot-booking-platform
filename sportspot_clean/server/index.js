import 'dotenv/config'
import path from 'path'
import express from 'express'
import { fileURLToPath } from 'url'
import app from './app.js'
import { pool } from './db.js'
import { ensureWalletSchema } from './lib/walletSchemaBootstrap.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3001

// Serve uploaded venue photos (local dev only)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
}

async function start() {
  await ensureWalletSchema(pool)

  app.listen(PORT, () => {
    console.log(`SportSpot server running on port ${PORT}`)
  })
}

start().catch((err) => {
  console.error('Server start failed:', err)
  process.exit(1)
})
