import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { analyzeClothingImage, embedText } from '@/lib/cortex'
import { query } from '@/lib/snowflake'
import type { ClosetItemRow } from '@/types'

function parseArrayField(value: unknown): string[] | null {
  if (Array.isArray(value)) return value as string[]
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return null
}

function coerceRow(row: ClosetItemRow): ClosetItemRow {
  return {
    ...row,
    COLORS: parseArrayField(row.COLORS),
    SEASONS: parseArrayField(row.SEASONS),
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { itemId?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { itemId } = body
  if (!itemId || typeof itemId !== 'string') {
    return Response.json({ error: 'itemId is required' }, { status: 400 })
  }

  const rows = await query<ClosetItemRow>(
    `SELECT * FROM CLOSET_ITEMS WHERE ID = ? LIMIT 1`,
    [itemId]
  )
  const existing = rows[0]

  if (!existing) {
    return Response.json({ error: 'Item not found' }, { status: 404 })
  }
  if (existing.USER_ID !== userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const analysis = await analyzeClothingImage(existing.IMAGE_URL)
  const descriptionText =
    `${analysis.category} ${analysis.subcategory} — ${analysis.description}`
  const embedding = await embedText(descriptionText)

  await query(
    `UPDATE CLOSET_ITEMS SET
      CATEGORY       = ?,
      SUBCATEGORY    = ?,
      COLORS         = PARSE_JSON(?),
      PATTERN        = ?,
      MATERIAL       = ?,
      FORMALITY      = ?,
      SEASONS        = PARSE_JSON(?),
      AI_DESCRIPTION = ?,
      EMBEDDING      = TO_VECTOR(?, FLOAT, 768),
      AI_STATUS      = 'complete'
    WHERE ID = ?`,
    [
      analysis.category,
      analysis.subcategory,
      JSON.stringify(analysis.colors),
      analysis.pattern,
      analysis.material,
      analysis.formality,
      JSON.stringify(analysis.seasons),
      analysis.description,
      JSON.stringify(embedding),
      itemId,
    ]
  )

  const updated = await query<ClosetItemRow>(
    `SELECT * FROM CLOSET_ITEMS WHERE ID = ? LIMIT 1`,
    [itemId]
  )
  const item = coerceRow(updated[0])

  return Response.json({ item }, { status: 200 })
}
