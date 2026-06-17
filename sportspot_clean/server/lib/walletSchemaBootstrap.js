import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let hasAttemptedWalletBootstrap = false

export async function ensureWalletSchema(pool) {
  if (hasAttemptedWalletBootstrap) return
  hasAttemptedWalletBootstrap = true

  const walletSchemaPath = path.join(__dirname, '../wallet_schema.sql')

  try {
    const sql = await fs.readFile(walletSchemaPath, 'utf8')
    await pool.query(sql)
    console.log('Wallet schema bootstrap completed')
  } catch (err) {
    console.error('Wallet schema bootstrap failed:', err.message)
  }
}
