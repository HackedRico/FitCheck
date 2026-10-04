import { getServerSession } from 'next-auth'
import { writeFile, unlink } from 'fs/promises'
import os from 'os'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { analyzeClothingImage, embedText, CLOSET_IMAGE_STAGE } from '@/lib/cortex'
import { query } from '@/lib/snowflake'
import type { ClosetItemRow, Season } from '@/types'

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
    SEASONS: parseArrayField(row.SEASONS) as Season[] | null,
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

  const imageResponse = await fetch(existing.IMAGE_URL)
  if (!imageResponse.ok) {
    return Response.json({ error: 'Could not fetch item image' }, { status: 502 })
  }
  const buffer = Buffer.from(await imageResponse.arrayBuffer())
  const tmpPath = path.join(os.tmpdir(), `${itemId}.jpg`)
  await writeFile(tmpPath, buffer)
  await query(
    `PUT 'file://${tmpPath}' ${CLOSET_IMAGE_STAGE} AUTO_COMPRESS=FALSE OVERWRITE=TRUE`
  )
  await unlink(tmpPath).catch(() => {})

  const analysis = await analyzeClothingImage(`${itemId}.jpg`)
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
      EMBEDDING      = PARSE_JSON(?)::VECTOR(FLOAT, 768),
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
