import { query } from '@/lib/snowflake'
import type {
  ClothingAnalysis,
  OutfitGenerationResult,
  ShoppingSuggestionsResult,
  ShoppingAssistantResult,
  TasteProfileRow,
  ClosetItemRow,
  WeatherContext,
} from '@/types'

async function completeJsonWithRetry<T>(prompt: string, context: string): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rows = await query<{ RESPONSE: string }>(`
        SELECT SNOWFLAKE.CORTEX.COMPLETE('llama3.1-70b', ?) AS RESPONSE
      `, [prompt])
      return parseCortexJson<T>(rows[0].RESPONSE, context)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

function parseCortexJson<T>(raw: string, context: string): T {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Cortex (${context}): no JSON in response. Raw: ${raw.slice(0, 200)}`)
  try {
    return JSON.parse(match[0]) as T
  } catch {
    throw new Error(`Cortex (${context}): JSON.parse failed. Matched: ${match[0].slice(0, 200)}`)
  }
}

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

export const CLOSET_IMAGE_STAGE = '@FITCHECK.APP.CLOSET_IMAGES'

export async function analyzeClothingImage(stageFileName: string): Promise<ClothingAnalysis> {
  const rows = await query<{ RESPONSE: string }>(`
    SELECT SNOWFLAKE.CORTEX.COMPLETE(
      'pixtral-large',
      PROMPT(?, TO_FILE('${CLOSET_IMAGE_STAGE}', ?))
    ) AS RESPONSE
  `, [ANALYZE_PROMPT, stageFileName])

  return parseCortexJson<ClothingAnalysis>(rows[0].RESPONSE, 'analyzeClothingImage')
}

export async function generateOutfit(params: {
  closetItems: ClosetItemRow[]
  tasteProfile: TasteProfileRow
  weather: WeatherContext
  occasion?: string
}): Promise<OutfitGenerationResult> {
  const { closetItems, tasteProfile, weather, occasion = 'daily' } = params

  const itemSummaries = closetItems.map((i) => ({
    id: i.ID,
    category: i.CATEGORY,
    subcategory: i.SUBCATEGORY,
    colors: i.COLORS,
    pattern: i.PATTERN,
    formality: i.FORMALITY,
    seasons: i.SEASONS,
  }))

  const prompt = `
You are a personal stylist. Generate a complete outfit from the user's wardrobe.

USER STYLE PROFILE:
- Aesthetics: ${tasteProfile.STYLE_AESTHETICS?.join(', ') ?? 'not specified'}
- Favorite colors: ${tasteProfile.FAVORITE_COLORS?.join(', ') ?? 'not specified'}
- Brands they like: ${tasteProfile.FAVORITE_BRANDS?.join(', ') ?? 'not specified'}
- Body type: ${tasteProfile.BODY_TYPE ?? 'not specified'}
- Skin tone: ${tasteProfile.SKIN_TONE ?? 'not specified'}
- Occasion: ${occasion}

TODAY'S WEATHER:
- Temperature: ${weather.temp}°F (feels like ${weather.feels_like}°F)
- Condition: ${weather.condition}
- Rain chance: ${weather.rain_chance}%

AVAILABLE WARDROBE:
${JSON.stringify(itemSummaries, null, 2)}

Rules:
- Pick at minimum: one TOP or DRESS, one BOTTOM (unless DRESS chosen), one SHOES
- Must be weather-appropriate for ${weather.temp}°F and ${weather.condition}
- Colors must complement each other
- Match the user's aesthetic profile
- "missing_pieces" must ALWAYS list 1 to 3 item types the user does NOT own that would complete or elevate this look for the occasion (never an empty array)
- Return ONLY valid JSON:
{
  "selected_item_ids": ["id1", "id2", "id3"],
  "rationale": "2-3 sentence explanation of why this outfit works",
  "missing_pieces": ["item type 1", "item type 2"]
}
`.trim()

  return completeJsonWithRetry<OutfitGenerationResult>(prompt, 'generateOutfit')
}

export async function generateShoppingSuggestions(params: {
  missingPieces: string[]
  tasteProfile: TasteProfileRow
  outfitColors: string[]
}): Promise<ShoppingSuggestionsResult> {
  const { missingPieces, tasteProfile, outfitColors } = params

  if (missingPieces.length === 0) return { suggestions: [] }

  const prompt = `
You are a fashion shopping assistant. Suggest specific products to fill wardrobe gaps.

MISSING PIECES NEEDED: ${missingPieces.join(', ')}

USER PREFERENCES:
- Style: ${tasteProfile.STYLE_AESTHETICS?.join(', ') ?? 'not specified'}
- Budget per item: $${tasteProfile.BUDGET_MIN ?? 0} - $${tasteProfile.BUDGET_MAX ?? 200}
- Favorite brands: ${tasteProfile.FAVORITE_BRANDS?.join(', ') ?? 'not specified'}
- Size tops: ${tasteProfile.SIZE_TOPS ?? 'unknown'}, bottoms: ${tasteProfile.SIZE_BOTTOMS ?? 'unknown'}, shoes: ${tasteProfile.SIZE_SHOES ?? 'unknown'}

CURRENT OUTFIT COLORS: ${outfitColors.join(', ')}

For each missing piece suggest 2 products: one with "source": "online" and one with "source": "in_store".
"source" must be exactly "online" or "in_store". "price" must be a plain number with no symbols.
Return ONLY valid JSON:
{
  "suggestions": [
    {
      "name": "Product name",
      "brand": "Brand",
      "price": 45,
      "category": "SHOES",
      "source": "online",
      "store_name": "Zara",
      "suggested_because": "brief reason",
      "search_query": "search term to find this product"
    }
  ]
}
`.trim()

  const rows = await query<{ RESPONSE: string }>(`
    SELECT SNOWFLAKE.CORTEX.COMPLETE('llama3.1-70b', ?) AS RESPONSE
  `, [prompt])

  return parseCortexJson<ShoppingSuggestionsResult>(rows[0].RESPONSE, 'generateShoppingSuggestions')
}

export async function shoppingAssistant(params: {
  request: string
  stores: string[]
  tasteProfile: TasteProfileRow
  closetSummary: string[]
}): Promise<ShoppingAssistantResult> {
  const { request, stores, tasteProfile, closetSummary } = params

  const prompt = `
You are a personal shopping assistant helping a user buy clothes.

USER REQUEST: ${request}

WHERE THEY WANT TO SHOP: ${stores.length > 0 ? stores.join(', ') : 'no preference — pick fitting well-known stores'}

USER PREFERENCES:
- Style: ${tasteProfile.STYLE_AESTHETICS?.join(', ') ?? 'not specified'}
- Favorite colors: ${tasteProfile.FAVORITE_COLORS?.join(', ') ?? 'not specified'}
- Colors to avoid: ${tasteProfile.AVOID_COLORS?.join(', ') ?? 'none'}
- Budget per item: $${tasteProfile.BUDGET_MIN ?? 0} - $${tasteProfile.BUDGET_MAX ?? 200}
- Favorite brands: ${tasteProfile.FAVORITE_BRANDS?.join(', ') ?? 'not specified'}
- Sizes: tops ${tasteProfile.SIZE_TOPS ?? 'unknown'}, bottoms ${tasteProfile.SIZE_BOTTOMS ?? 'unknown'}, shoes ${tasteProfile.SIZE_SHOES ?? 'unknown'}

THEY ALREADY OWN: ${closetSummary.length > 0 ? closetSummary.join('; ') : 'unknown'}

Rules:
- Suggest 4 to 6 specific products matching the request, budget and style
- Prefer the stores they want to shop at; set "store_name" accordingly
- Mix "source": "online" and "source": "in_store" so they can shop either way
- Suggestions should complement what they already own, not duplicate it
- "source" must be exactly "online" or "in_store". "price" must be a plain number
- "advice" is 1-2 sentences of personal guidance for this request
Return ONLY valid JSON:
{
  "advice": "short personal note",
  "suggestions": [
    {
      "name": "Product name",
      "brand": "Brand",
      "price": 45,
      "category": "SHOES",
      "source": "online",
      "store_name": "Zara",
      "suggested_because": "brief reason",
      "search_query": "search term to find this product"
    }
  ]
}
`.trim()

  return completeJsonWithRetry<ShoppingAssistantResult>(prompt, 'shoppingAssistant')
}

export async function embedText(text: string): Promise<number[]> {
  const rows = await query<{ EMBEDDING: string }>(`
    SELECT SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', ?) AS EMBEDDING
  `, [text])
  return JSON.parse(rows[0].EMBEDDING) as number[]
}

export async function findOwnedMatch(
  userId: string,
  text: string
): Promise<string | null> {
  try {
    const trimmed = text.trim()
    if (!trimmed) return null
    const match = await query<{ SUBCATEGORY: string | null; SCORE: number }>(
      `SELECT SUBCATEGORY,
         VECTOR_COSINE_SIMILARITY(
           EMBEDDING,
           SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', ?)
         ) AS SCORE
       FROM CLOSET_ITEMS
       WHERE USER_ID = ? AND IS_ACTIVE = TRUE AND EMBEDDING IS NOT NULL
       ORDER BY SCORE DESC
       LIMIT 1`,
      [trimmed, userId]
    )
    if (match[0] && match[0].SCORE >= 0.8 && match[0].SUBCATEGORY) {
      return match[0].SUBCATEGORY
    }
    return null
  } catch {
    return null
  }
}
