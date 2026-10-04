import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query<ClosetItemRow>(
    `SELECT
       ID, USER_ID, IMAGE_URL, THUMBNAIL_URL, CATEGORY, SUBCATEGORY,
       COLORS, PATTERN, MATERIAL, FORMALITY, SEASONS, AI_DESCRIPTION,
       AI_STATUS, BRAND, NOTES, IS_ACTIVE, CREATED_AT
     FROM CLOSET_ITEMS
     WHERE USER_ID = ? AND IS_ACTIVE = TRUE
     ORDER BY CREATED_AT DESC`,
    [session.user.id]
  )

  const items = rows.map(coerceRow)
  return Response.json({ items })
}

export async function DELETE(request: Request): Promise<Response> {
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

  const rows = await query<Pick<ClosetItemRow, 'ID' | 'USER_ID'>>(
    `SELECT ID, USER_ID FROM CLOSET_ITEMS WHERE ID = ? LIMIT 1`,
    [itemId]
  )
  const existing = rows[0]

  if (!existing) {
    return Response.json({ error: 'Item not found' }, { status: 404 })
  }
  if (existing.USER_ID !== userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await query(
    `UPDATE CLOSET_ITEMS SET IS_ACTIVE = FALSE WHERE ID = ?`,
    [itemId]
  )

  return Response.json({ ok: true })
}
