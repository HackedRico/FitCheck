import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'
import type { TasteProfileRow, TasteProfilePayload } from '@/types'

const ARRAY_COLUMNS = [
  'STYLE_AESTHETICS',
  'FAVORITE_COLORS',
  'AVOID_COLORS',
  'FAVORITE_BRANDS',
] as const

function parseRow(row: Record<string, unknown>): TasteProfileRow {
  const out = { ...row } as Record<string, unknown>
  for (const col of ARRAY_COLUMNS) {
    const val = out[col]
    if (typeof val === 'string') {
      try {
        out[col] = JSON.parse(val)
      } catch {
        out[col] = []
      }
    } else if (val == null) {
      out[col] = null
    }
  }
  return out as unknown as TasteProfileRow
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM TASTE_PROFILES WHERE USER_ID = ? LIMIT 1`,
    [session.user.id]
  )

  if (rows.length === 0) {
    return Response.json({ error: 'No taste profile found' }, { status: 404 })
  }

  return Response.json(parseRow(rows[0]))
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: TasteProfilePayload
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userId = session.user.id
  const now = new Date().toISOString()

  const updateResult = await query<Record<string, unknown>>(
    `UPDATE TASTE_PROFILES SET
      STYLE_AESTHETICS = PARSE_JSON(?),
      FAVORITE_COLORS  = PARSE_JSON(?),
      AVOID_COLORS     = PARSE_JSON(?),
      FAVORITE_BRANDS  = PARSE_JSON(?),
      BUDGET_MIN       = ?,
      BUDGET_MAX       = ?,
      BODY_TYPE        = ?,
      SKIN_TONE        = ?,
      GENDER           = ?,
      SIZE_TOPS        = ?,
      SIZE_BOTTOMS     = ?,
      SIZE_SHOES       = ?,
      UPDATED_AT       = ?
    WHERE USER_ID = ?`,
    [
      JSON.stringify(body.style_aesthetics),
      JSON.stringify(body.favorite_colors),
      JSON.stringify(body.avoid_colors),
      JSON.stringify(body.favorite_brands),
      body.budget_min,
      body.budget_max,
      body.body_type,
      body.skin_tone,
      body.gender,
      body.size_tops,
      body.size_bottoms,
      body.size_shoes,
      now,
      userId,
    ]
  )

  const rowsUpdated =
    (updateResult[0]?.['number of rows updated'] as number | undefined) ?? 0

  if (rowsUpdated === 0) {
    await query(
      `INSERT INTO TASTE_PROFILES (
        ID, USER_ID,
        STYLE_AESTHETICS, FAVORITE_COLORS, AVOID_COLORS, FAVORITE_BRANDS,
        BUDGET_MIN, BUDGET_MAX,
        BODY_TYPE, SKIN_TONE, GENDER,
        SIZE_TOPS, SIZE_BOTTOMS, SIZE_SHOES,
        UPDATED_AT
      ) VALUES (
        UUID_STRING(), ?,
        PARSE_JSON(?), PARSE_JSON(?), PARSE_JSON(?), PARSE_JSON(?),
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?
      )`,
      [
        userId,
        JSON.stringify(body.style_aesthetics),
        JSON.stringify(body.favorite_colors),
        JSON.stringify(body.avoid_colors),
        JSON.stringify(body.favorite_brands),
        body.budget_min,
        body.budget_max,
        body.body_type,
        body.skin_tone,
        body.gender,
        body.size_tops,
        body.size_bottoms,
        body.size_shoes,
        now,
      ]
    )
  }

  return Response.json({ success: true })
}
