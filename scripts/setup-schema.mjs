import snowflake from 'snowflake-sdk'
import { readFileSync } from 'fs'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}

snowflake.configure({ logLevel: 'ERROR' })

const conn = snowflake.createConnection({
  account: env.SNOWFLAKE_ACCOUNT,
  username: env.SNOWFLAKE_USERNAME,
  password: env.SNOWFLAKE_PASSWORD,
  warehouse: env.SNOWFLAKE_WAREHOUSE,
  role: env.SNOWFLAKE_ROLE,
})

const run = (sql) =>
  new Promise((resolve, reject) =>
    conn.execute({
      sqlText: sql,
      complete: (err, _s, rows) => (err ? reject(err) : resolve(rows)),
    })
  )

const statements = [
  `CREATE DATABASE IF NOT EXISTS FITCHECK`,
  `CREATE SCHEMA IF NOT EXISTS FITCHECK.APP`,
  `USE SCHEMA FITCHECK.APP`,
  `CREATE TABLE IF NOT EXISTS USERS (
    id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    display_name VARCHAR,
    location_lat FLOAT,
    location_lng FLOAT,
    zip_code VARCHAR,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
  )`,
  `CREATE TABLE IF NOT EXISTS TASTE_PROFILES (
    id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
    user_id VARCHAR UNIQUE NOT NULL REFERENCES USERS(id),
    style_aesthetics ARRAY,
    favorite_colors ARRAY,
    avoid_colors ARRAY,
    favorite_brands ARRAY,
    budget_min INTEGER,
    budget_max INTEGER,
    body_type VARCHAR,
    skin_tone VARCHAR,
    gender VARCHAR,
    size_tops VARCHAR,
    size_bottoms VARCHAR,
    size_shoes VARCHAR,
    updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
  )`,
  `CREATE TABLE IF NOT EXISTS CLOSET_ITEMS (
    id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
    user_id VARCHAR NOT NULL REFERENCES USERS(id),
    image_url VARCHAR NOT NULL,
    thumbnail_url VARCHAR,
    category VARCHAR,
    subcategory VARCHAR,
    colors ARRAY,
    pattern VARCHAR,
    material VARCHAR,
    formality VARCHAR,
    seasons ARRAY,
    ai_description VARCHAR,
    embedding VECTOR(FLOAT, 768),
    ai_status VARCHAR DEFAULT 'pending',
    brand VARCHAR,
    notes VARCHAR,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
  )`,
  `CREATE TABLE IF NOT EXISTS OUTFITS (
    id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
    user_id VARCHAR NOT NULL REFERENCES USERS(id),
    item_ids ARRAY,
    ai_rationale VARCHAR,
    weather_context VARIANT,
    occasion VARCHAR DEFAULT 'daily',
    user_rating INTEGER,
    is_saved BOOLEAN DEFAULT FALSE,
    is_worn BOOLEAN DEFAULT FALSE,
    worn_date DATE,
    generated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    outfit_date DATE DEFAULT CURRENT_DATE()
  )`,
  `CREATE TABLE IF NOT EXISTS PRODUCT_SUGGESTIONS (
    id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
    outfit_id VARCHAR REFERENCES OUTFITS(id),
    user_id VARCHAR NOT NULL REFERENCES USERS(id),
    name VARCHAR,
    brand VARCHAR,
    price INTEGER,
    image_url VARCHAR,
    product_url VARCHAR,
    source VARCHAR,
    store_name VARCHAR,
    category VARCHAR,
    suggested_because VARCHAR,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
  )`,
  `SHOW TABLES IN SCHEMA FITCHECK.APP`,
]

conn.connect(async (err) => {
  if (err) {
    console.error('CONNECT FAILED:', err.message)
    process.exit(1)
  }
  console.log('Connected to Snowflake.')
  for (const sql of statements) {
    const label = sql.slice(0, 60).replace(/\s+/g, ' ')
    try {
      const rows = await run(sql)
      if (sql.startsWith('SHOW')) {
        console.log('Tables:', rows.map((r) => r.name).join(', '))
      } else {
        console.log('OK:', label)
      }
    } catch (e) {
      console.error('FAILED:', label, '->', e.message)
      process.exit(1)
    }
  }
  conn.destroy(() => process.exit(0))
})
