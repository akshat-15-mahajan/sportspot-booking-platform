import pg from 'pg'

// Parse numeric/decimal columns as JS floats instead of strings
pg.types.setTypeParser(1700, parseFloat)

const connectionString = process.env.AIVEN_DATABASE_URL || process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('Missing database connection string. Set AIVEN_DATABASE_URL or DATABASE_URL.')
}

const isLocal =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1')

const ssl = process.env.DATABASE_SSL === 'false' || isLocal
  ? false
  : { rejectUnauthorized: false }

const pool = new pg.Pool({
  connectionString,
  ssl,
})

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err)
})

export { pool }
