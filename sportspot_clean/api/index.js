import { pool } from '../server/db.js'
import app from '../server/app.js'
import { ensureWalletSchema } from '../server/lib/walletSchemaBootstrap.js'

await ensureWalletSchema(pool)

// Tell Vercel NOT to parse the body — let Express/multer handle it
export const config = {
  api: {
    bodyParser: false,
  },
}

export default app
