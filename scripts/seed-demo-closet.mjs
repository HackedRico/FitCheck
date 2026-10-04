import snowflake from 'snowflake-sdk'
import { v2 as cloudinary } from 'cloudinary'
import { readFileSync, readdirSync, copyFileSync } from 'fs'
import { randomUUID } from 'crypto'
import os from 'os'
import path from 'path'

const email = process.argv[2]
if (!email) {
  console.error('Usage: node scripts/seed-demo-closet.mjs <user-email>')
  process.exit(1)
}

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
})

snowflake.configure({ logLevel: 'ERROR' })
const conn = snowflake.createConnection({
  account: env.SNOWFLAKE_ACCOUNT,
  username: env.SNOWFLAKE_USERNAME,
  password: env.SNOWFLAKE_PASSWORD,
  database: 'FITCHECK',
  schema: 'APP',
  warehouse: env.SNOWFLAKE_WAREHOUSE,
  role: env.SNOWFLAKE_ROLE,
})

const query = (sql, binds = []) =>
  new Promise((res, rej) =>
    conn.execute({ sqlText: sql, binds, complete: (e, _s, r) => (e ? rej(e) : res(r)) })
  )

const ANALYZE_PROMPT = `
You are a fashion expert. Analyze the clothing item in this image: {0}
Return ONLY a valid JSON object with no other text, using exactly these keys:
"category": one of TOP, BOTTOM, DRESS, OUTERWEAR, SHOES, ACCESSORY, BAG
"subcategory": specific item name such as crew neck sweater
"colors": array of color name strings
"pattern": one of solid, striped, plaid, floral, graphic, other
"material": estimated material such as cotton, denim, wool
"formality": one of CASUAL, SMART_CASUAL, BUSINESS, FORMAL
"seasons": array drawn from spring, summer, fall, winter
"description": one sentence describing this item for outfit matching
`.trim()

function parseCortexJson(raw) {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`no JSON in Cortex response: ${raw.slice(0, 120)}`)
  return JSON.parse(match[0])
}

conn.connect(async (err) => {
  if (err) {
    console.error('CONNECT FAILED:', err.message)
    process.exit(1)
  }

  const users = await query(`SELECT ID FROM USERS WHERE EMAIL = ? LIMIT 1`, [email])
  if (users.length === 0) {
    console.error(`No user with email ${email}`)
    process.exit(1)
  }
  const userId = users[0].ID
  console.log(`Seeding closet for ${email} (${userId})`)

  const profile = await query(`SELECT ID FROM TASTE_PROFILES WHERE USER_ID = ? LIMIT 1`, [userId])
  if (profile.length === 0) {
    await query(
      `INSERT INTO TASTE_PROFILES
         (ID, USER_ID, STYLE_AESTHETICS, FAVORITE_COLORS, FAVORITE_BRANDS, BUDGET_MIN, BUDGET_MAX,
          GENDER, SIZE_TOPS, SIZE_BOTTOMS, SIZE_SHOES, UPDATED_AT)
       SELECT ?, ?, PARSE_JSON(?), PARSE_JSON(?), PARSE_JSON(?), ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP()`,
      [
        randomUUID(),
        userId,
        JSON.stringify(['minimalist', 'smart casual']),
        JSON.stringify(['navy', 'black', 'white', 'beige']),
        JSON.stringify(['Uniqlo', 'Nike', 'Zara']),
        20,
        150,
        'unspecified',
        'M',
        '32',
        '10',
      ]
    )
    console.log('Created default taste profile')
  }

  const deactivated = await query(
    `UPDATE CLOSET_ITEMS SET IS_ACTIVE = FALSE WHERE USER_ID = ?`,
    [userId]
  )
  console.log(`Deactivated ${deactivated[0]?.['number of rows updated'] ?? 0} old items`)

  const images = readdirSync('demo/images').filter((f) => f.endsWith('.jpg'))
  let ok = 0
  let failed = 0

  for (const file of images) {
    const itemId = randomUUID()
    const localPath = path.resolve('demo/images', file)
    try {
      const uploaded = await cloudinary.uploader.upload(localPath, {
        folder: `fitcheck/users/${userId}`,
        public_id: itemId,
      })
      const thumb = cloudinary.url(uploaded.public_id, {
        width: 400,
        height: 500,
        crop: 'fill',
        format: 'jpg',
      })

      await query(
        `INSERT INTO CLOSET_ITEMS (ID, USER_ID, IMAGE_URL, THUMBNAIL_URL, AI_STATUS, IS_ACTIVE, CREATED_AT)
         SELECT ?, ?, ?, ?, 'pending', TRUE, CURRENT_TIMESTAMP()`,
        [itemId, userId, uploaded.secure_url, thumb]
      )

      const tmpPath = path.join(os.tmpdir(), `${itemId}.jpg`)
      copyFileSync(localPath, tmpPath)
      await query(
        `PUT 'file://${tmpPath}' @FITCHECK.APP.CLOSET_IMAGES AUTO_COMPRESS=FALSE OVERWRITE=TRUE`
      )

      const rows = await query(
        `SELECT SNOWFLAKE.CORTEX.COMPLETE('pixtral-large', PROMPT(?, TO_FILE('@FITCHECK.APP.CLOSET_IMAGES', ?))) AS RESPONSE`,
        [ANALYZE_PROMPT, `${itemId}.jpg`]
      )
      const analysis = parseCortexJson(rows[0].RESPONSE)

      const embedRows = await query(
        `SELECT SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', ?) AS EMBEDDING`,
        [`${analysis.category} ${analysis.subcategory} — ${analysis.description}`]
      )

      await query(
        `UPDATE CLOSET_ITEMS SET
           CATEGORY = ?, SUBCATEGORY = ?, COLORS = PARSE_JSON(?), PATTERN = ?, MATERIAL = ?,
           FORMALITY = ?, SEASONS = PARSE_JSON(?), AI_DESCRIPTION = ?,
           EMBEDDING = PARSE_JSON(?)::VECTOR(FLOAT, 768), AI_STATUS = 'complete'
         WHERE ID = ?`,
        [
          analysis.category,
          analysis.subcategory,
          JSON.stringify(analysis.colors ?? []),
          analysis.pattern,
          analysis.material,
          analysis.formality,
          JSON.stringify(analysis.seasons ?? []),
          analysis.description,
          embedRows[0].EMBEDDING,
          itemId,
        ]
      )
      ok += 1
      console.log(`OK  ${file} → ${analysis.category} / ${analysis.subcategory}`)
    } catch (e) {
      failed += 1
      await query(`UPDATE CLOSET_ITEMS SET AI_STATUS = 'failed' WHERE ID = ?`, [itemId]).catch(() => {})
      console.error(`FAIL ${file}: ${e.message}`)
    }
  }

  await query(
    `DELETE FROM PRODUCT_SUGGESTIONS WHERE OUTFIT_ID IN
       (SELECT ID FROM OUTFITS WHERE USER_ID = ? AND OUTFIT_DATE = CURRENT_DATE())`,
    [userId]
  )
  await query(`DELETE FROM OUTFITS WHERE USER_ID = ? AND OUTFIT_DATE = CURRENT_DATE()`, [userId])
  console.log(`Cleared today's outfit so the dashboard regenerates`)

  console.log(`Done: ${ok} seeded, ${failed} failed`)
  conn.destroy(() => process.exit(failed > 0 ? 1 : 0))
})
