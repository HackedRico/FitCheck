import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/snowflake'
import { generateOutfit, generateShoppingSuggestions, findOwnedMatch } from '@/lib/cortex'
import { getWeather } from '@/lib/weather'
import { getTodaysEvents, occasionFromEvents } from '@/lib/calendar'
import type {
  ClosetItemRow,
  TasteProfileRow,
  OutfitRow,
  ProductSuggestionRow,
  ShoppingSuggestion,
  WeatherContext,
} from '@/types'

function toSuggestionPayload(row: ProductSuggestionRow): ShoppingSuggestion {
  return {
    name: row.NAME ?? '',
    brand: row.BRAND ?? '',
    price: row.PRICE ?? 0,
    category: row.CATEGORY ?? '',
    source: (row.SOURCE ?? '').toLowerCase().includes('online') ? 'online' : 'in_store',
    store_name: row.STORE_NAME ?? '',
    suggested_because: row.SUGGESTED_BECAUSE ?? '',
    search_query:
      row.SEARCH_QUERY?.trim() || [row.BRAND, row.NAME].filter(Boolean).join(' '),
    already_owned: row.ALREADY_OWNED ?? null,
  }
}

const DRESSY_OCCASION = /\b(formal|interview|business|dinner|dressy|wedding|date)\b/i
const DRESSY_FORMALITY = new Set(['FORMAL', 'BUSINESS', 'SMART_CASUAL'])

function ensureCompleteOutfit(
  ids: string[],
  closet: ClosetItemRow[],
  occasion: string
): string[] {
  const selected = new Set(
    ids.filter((id) => closet.some((item) => item.ID === id))
  )
  const has = (cat: string) =>
    closet.some((item) => selected.has(item.ID) && item.CATEGORY === cat)
  const wantDressy = DRESSY_OCCASION.test(occasion)

  const pick = (cat: string) => {
    const pool = closet.filter(
      (item) => item.CATEGORY === cat && !selected.has(item.ID)
    )
    if (pool.length === 0) return
    const ranked = pool.filter((item) =>
      wantDressy
        ? DRESSY_FORMALITY.has(item.FORMALITY ?? '')
        : item.FORMALITY !== 'FORMAL'
    )
    selected.add((ranked[0] ?? pool[0]).ID)
  }

  if (!has('TOP') && !has('DRESS')) pick('TOP')
  if (!has('BOTTOM') && !has('DRESS')) pick('BOTTOM')
  if (!has('SHOES')) pick('SHOES')

  return [...selected]
}

async function generateAndPersist(
  userId: string,
  requestedOccasion: string = 'daily'
): Promise<Response> {
  let occasion = requestedOccasion
  if (requestedOccasion === 'daily') {
    const eventOccasion = occasionFromEvents(await getTodaysEvents())
    if (eventOccasion) occasion = eventOccasion
  }

  const userRows = await query<{
    LOCATION_LAT: number | null
    LOCATION_LNG: number | null
  }>(`SELECT LOCATION_LAT, LOCATION_LNG FROM USERS WHERE ID = ? LIMIT 1`, [userId])

  const user = userRows[0]

  if (!user?.LOCATION_LAT || !user?.LOCATION_LNG) {
    return Response.json({ error: 'location_required' }, { status: 400 })
  }

  const lat = user.LOCATION_LAT
  const lng = user.LOCATION_LNG

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

  if (closetRows.length < 3) {
    return Response.json({ error: 'insufficient_closet' }, { status: 400 })
  }

  const weather: WeatherContext = await getWeather(lat, lng)

  const outfitResult = await generateOutfit({
    closetItems: closetRows,
    tasteProfile: tasteProfile ?? ({} as TasteProfileRow),
    weather,
    occasion,
  })

  const selectedItemIds = ensureCompleteOutfit(
    outfitResult.selected_item_ids,
    closetRows,
    occasion
  )

  const outfitId = crypto.randomUUID()
  await query(
    `INSERT INTO OUTFITS
       (ID, USER_ID, ITEM_IDS, AI_RATIONALE, WEATHER_CONTEXT, OCCASION, OUTFIT_DATE, GENERATED_AT)
     SELECT ?, ?, PARSE_JSON(?), ?, PARSE_JSON(?), ?, CURRENT_DATE(), CURRENT_TIMESTAMP()`,
    [
      outfitId,
      userId,
      JSON.stringify(selectedItemIds),
      outfitResult.rationale,
      JSON.stringify(weather),
      occasion,
    ]
  )

  const selectedItems = closetRows.filter((item) =>
    selectedItemIds.includes(item.ID)
  )

  const outfitColors = selectedItems.flatMap((item) => item.COLORS ?? [])
  const { suggestions } = await generateShoppingSuggestions({
    missingPieces: outfitResult.missing_pieces,
    tasteProfile: tasteProfile ?? ({} as TasteProfileRow),
    outfitColors,
  })

  let persistedSuggestions: ProductSuggestionRow[] = []
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    try {
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
      for (const [i, s] of suggestions.entries()) {
        const price = Number(s.price)
        await query(
          `INSERT INTO PRODUCT_SUGGESTIONS
             (ID, OUTFIT_ID, USER_ID, NAME, BRAND, PRICE, SOURCE, STORE_NAME, CATEGORY, SUGGESTED_BECAUSE, SEARCH_QUERY, ALREADY_OWNED, CREATED_AT)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP()`,
          [
            crypto.randomUUID(),
            outfitId,
            userId,
            typeof s.name === 'string' ? s.name : null,
            typeof s.brand === 'string' ? s.brand : null,
            Number.isFinite(price) ? Math.round(price) : null,
            typeof s.source === 'string' && s.source.toLowerCase().includes('online')
              ? 'online'
              : 'in_store',
            typeof s.store_name === 'string' ? s.store_name : null,
            typeof s.category === 'string' ? s.category : null,
            typeof s.suggested_because === 'string' ? s.suggested_because : null,
            typeof s.search_query === 'string' ? s.search_query : null,
            ownedMatches[i] ?? null,
          ]
        )
      }
      persistedSuggestions = await query<ProductSuggestionRow>(
        `SELECT * FROM PRODUCT_SUGGESTIONS WHERE OUTFIT_ID = ? ORDER BY CREATED_AT ASC`,
        [outfitId]
      )
    } catch (err) {
      console.error('Suggestion persistence failed:', err)
      persistedSuggestions = []
    }
  }

  const outfitRows = await query<OutfitRow>(
    `SELECT * FROM OUTFITS WHERE ID = ? LIMIT 1`,
    [outfitId]
  )

  return Response.json({
    outfit: outfitRows[0] ?? null,
    items: selectedItems,
    suggestions: persistedSuggestions.map(toSuggestionPayload),
    weather,
  })
}

export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const existing = await query<OutfitRow>(
    `SELECT * FROM OUTFITS WHERE USER_ID = ? AND OUTFIT_DATE = CURRENT_DATE() LIMIT 1`,
    [userId]
  )

  if (existing.length > 0) {
    const outfit = existing[0]

    const itemIds: string[] = Array.isArray(outfit.ITEM_IDS) ? outfit.ITEM_IDS : []

    const [items, suggestions] = await Promise.all([
      itemIds.length > 0
        ? query<ClosetItemRow>(
            `SELECT * FROM CLOSET_ITEMS WHERE ID IN (${itemIds.map(() => '?').join(',')}) AND USER_ID = ?`,
            [...itemIds, userId]
          )
        : Promise.resolve([] as ClosetItemRow[]),
      query<ProductSuggestionRow>(
        `SELECT * FROM PRODUCT_SUGGESTIONS WHERE OUTFIT_ID = ? ORDER BY CREATED_AT ASC`,
        [outfit.ID]
      ),
    ])

    return Response.json({
      outfit,
      items,
      suggestions: suggestions.map(toSuggestionPayload),
      weather: outfit.WEATHER_CONTEXT,
    })
  }

  return generateAndPersist(userId)
}

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  let occasion = 'daily'
  try {
    const body = await request.json()
    if (typeof body?.occasion === 'string') occasion = body.occasion
  } catch {
  }

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
