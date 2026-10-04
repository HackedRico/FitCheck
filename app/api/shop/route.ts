import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'
import { shoppingAssistant, findOwnedMatch } from '@/lib/cortex'
import type { ClosetItemRow, TasteProfileRow } from '@/types'

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { query?: unknown; stores?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const searchQuery = typeof body.query === 'string' ? body.query.trim() : ''
  if (!searchQuery) {
    return Response.json({ error: 'Tell us what you are shopping for' }, { status: 400 })
  }

  const stores = Array.isArray(body.stores)
    ? body.stores
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
    : []

  const [profileRows, closetRows] = await Promise.all([
    query<TasteProfileRow>(
      `SELECT * FROM TASTE_PROFILES WHERE USER_ID = ? LIMIT 1`,
      [userId]
    ),
    query<ClosetItemRow>(
      `SELECT CATEGORY, SUBCATEGORY, COLORS FROM CLOSET_ITEMS
       WHERE USER_ID = ? AND IS_ACTIVE = TRUE AND AI_STATUS = 'complete'`,
      [userId]
    ),
  ])

  const closetSummary = closetRows.map((item) => {
    const colors = Array.isArray(item.COLORS) ? item.COLORS.join('/') : ''
    return [colors, item.SUBCATEGORY ?? item.CATEGORY].filter(Boolean).join(' ')
  })

  try {
    const result = await shoppingAssistant({
      request: searchQuery.slice(0, 300),
      stores,
      tasteProfile: profileRows[0] ?? ({} as TasteProfileRow),
      closetSummary,
    })

    const suggestions = Array.isArray(result.suggestions) ? result.suggestions : []
    const ownedMatches = await Promise.all(
      suggestions.map((s) =>
        findOwnedMatch(
          userId,
          [s.category, s.name]
            .filter((v) => typeof v === 'string' && v.trim())
            .join(' ')
        )
      )
    )

    return Response.json({
      advice: typeof result.advice === 'string' ? result.advice : '',
      suggestions: suggestions.map((s, i) => ({
        ...s,
        already_owned: ownedMatches[i] ?? null,
      })),
    })
  } catch (err) {
    console.error('Shopping assistant failed:', err)
    return Response.json(
      { error: 'Could not generate suggestions right now. Try again.' },
      { status: 502 }
    )
  }
}
