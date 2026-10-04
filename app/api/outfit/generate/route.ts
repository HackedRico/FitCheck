import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'
import { generateOutfit, generateShoppingSuggestions } from '@/lib/cortex'
import { getWeather } from '@/lib/weather'
import type {
  ClosetItemRow,
  TasteProfileRow,
  OutfitRow,
  ProductSuggestionRow,
  WeatherContext,
} from '@/types'

// ─── Shared generation logic ───────────────────────────────────────────────────

async function generateAndPersist(
  userId: string,
  occasion: string = 'daily'
): Promise<Response> {
  // 2. Fetch user row for location
  const userRows = await query<{
    LOCATION_LAT: number | null
    LOCATION_LNG: number | null
  }>(`SELECT LOCATION_LAT, LOCATION_LNG FROM USERS WHERE ID = ? LIMIT 1`, [userId])

  const user = userRows[0]

  // 3. Require location
  if (!user?.LOCATION_LAT || !user?.LOCATION_LNG) {
    return Response.json({ error: 'location_required' }, { status: 400 })
  }

  const lat = user.LOCATION_LAT
  const lng = user.LOCATION_LNG

  // 4 & 5. Fetch taste profile and active closet items in parallel
  const [profileRows, closetRows] = await Promise.all([
    query<TasteProfileRow>(
      `SELECT * FROM TASTE_PROFILES WHERE USER_ID = ? LIMIT 1`,
      [userId]
    ),
    query<ClosetItemRow>(
      `SELECT * FROM CLOSET_ITEMS WHERE USER_ID = ? AND IS_ACTIVE = TRUE AND AI_STATUS = 'complete'`,
      [userId]
    ),
  ])

  const tasteProfile = profileRows[0]

  // 6. Require at least 3 closet items
  if (closetRows.length < 3) {
    return Response.json({ error: 'insufficient_closet' }, { status: 400 })
  }

  // 7. Fetch weather
  const weather: WeatherContext = await getWeather(lat, lng)

  // 8. Generate outfit via Cortex
  const outfitResult = await generateOutfit({
    closetItems: closetRows,
    tasteProfile: tasteProfile ?? ({} as TasteProfileRow),
    weather,
    occasion,
  })

  // 9. Insert outfit and get back the ID
  const insertedRows = await query<{ ID: string }>(
    `INSERT INTO OUTFITS
       (ID, USER_ID, ITEM_IDS, AI_RATIONALE, WEATHER_CONTEXT, OCCASION, OUTFIT_DATE, GENERATED_AT)
     VALUES
       (UUID_STRING(), ?, PARSE_JSON(?), ?, PARSE_JSON(?), ?, CURRENT_DATE(), CURRENT_TIMESTAMP())
     RETURNING ID`,
    [
      userId,
      JSON.stringify(outfitResult.selected_item_ids),
      outfitResult.rationale,
      JSON.stringify(weather),
      occasion,
    ]
  )

  const outfitId = insertedRows[0]?.ID

  // Resolve the actual ClosetItemRow objects for selected IDs
  const selectedItems = closetRows.filter((item) =>
    outfitResult.selected_item_ids.includes(item.ID)
  )

  // 10. Generate shopping suggestions
  const outfitColors = selectedItems.flatMap((item) => item.COLORS ?? [])
  const { suggestions } = await generateShoppingSuggestions({
    missingPieces: outfitResult.missing_pieces,
    tasteProfile: tasteProfile ?? ({} as TasteProfileRow),
    outfitColors,
  })

  // 11. Insert each suggestion
  const persistedSuggestions: ProductSuggestionRow[] = []
  if (outfitId && suggestions.length > 0) {
    for (const s of suggestions) {
      const suggRows = await query<ProductSuggestionRow>(
        `INSERT INTO PRODUCT_SUGGESTIONS
           (ID, OUTFIT_ID, USER_ID, NAME, BRAND, PRICE, SOURCE, STORE_NAME, CATEGORY, SUGGESTED_BECAUSE, CREATED_AT)
         VALUES
           (UUID_STRING(), ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP())
         RETURNING *`,
        [
          outfitId,
          userId,
          s.name,
          s.brand,
          s.price,
          s.source,
          s.store_name,
          s.category,
          s.suggested_because,
        ]
      )
      if (suggRows[0]) persistedSuggestions.push(suggRows[0])
    }
  }

  // Fetch the newly inserted outfit row to return canonical shape
  const outfitRows = await query<OutfitRow>(
    `SELECT * FROM OUTFITS WHERE ID = ? LIMIT 1`,
    [outfitId]
  )

  // 12. Return full payload
  return Response.json({
    outfit: outfitRows[0] ?? null,
    items: selectedItems,
    suggestions: persistedSuggestions.length > 0 ? persistedSuggestions : suggestions,
    weather,
  })
}

// ─── GET: return cached today outfit or generate fresh ────────────────────────

export async function GET(): Promise<Response> {
  // 1. Auth check
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  // Check for existing outfit for today
  const existing = await query<OutfitRow>(
    `SELECT * FROM OUTFITS WHERE USER_ID = ? AND OUTFIT_DATE = CURRENT_DATE() LIMIT 1`,
    [userId]
  )

  if (existing.length > 0) {
    const outfit = existing[0]

    // Fetch associated items and suggestions in parallel
    const itemIds: string[] = Array.isArray(outfit.ITEM_IDS) ? outfit.ITEM_IDS : []

    const [items, suggestions] = await Promise.all([
      itemIds.length > 0
        ? query<ClosetItemRow>(
            `SELECT * FROM CLOSET_ITEMS WHERE ID IN (${itemIds.map(() => '?').join(',')})`,
            itemIds
          )
        : Promise.resolve([] as ClosetItemRow[]),
      query<ProductSuggestionRow>(
        `SELECT * FROM PRODUCT_SUGGESTIONS WHERE OUTFIT_ID = ? ORDER BY CREATED_AT ASC`,
        [outfit.ID]
      ),
    ])

    return Response.json({ outfit, items, suggestions, weather: outfit.WEATHER_CONTEXT })
  }

  // No cached outfit — generate one
  return generateAndPersist(userId)
}

// ─── POST: force regenerate (ignore today's cached outfit) ───────────────────

export async function POST(request: Request): Promise<Response> {
  // 1. Auth check
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  // Parse optional body fields
  let occasion = 'daily'
  try {
    const body = await request.json()
    if (typeof body?.occasion === 'string') occasion = body.occasion
  } catch {
    // no body or invalid JSON — use defaults
  }

  // Delete today's existing outfit (and its suggestions via cascade or explicit delete)
  await query(
    `DELETE FROM PRODUCT_SUGGESTIONS
     WHERE OUTFIT_ID IN (
       SELECT ID FROM OUTFITS WHERE USER_ID = ? AND OUTFIT_DATE = CURRENT_DATE()
     )`,
    [userId]
  )
  await query(
    `DELETE FROM OUTFITS WHERE USER_ID = ? AND OUTFIT_DATE = CURRENT_DATE()`,
    [userId]
  )

  return generateAndPersist(userId, occasion)
}
