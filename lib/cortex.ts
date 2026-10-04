import { query } from '@/lib/snowflake'
import type {
  ClothingAnalysis,
  OutfitGenerationResult,
  ShoppingSuggestionsResult,
  TasteProfileRow,
  ClosetItemRow,
  WeatherContext,
} from '@/types'

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

  const rows = await query<{ RESPONSE: string }>(`
    SELECT SNOWFLAKE.CORTEX.COMPLETE('llama3.1-70b', ?) AS RESPONSE
  `, [prompt])

  return parseCortexJson<OutfitGenerationResult>(rows[0].RESPONSE, 'generateOutfit')
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

export async function embedText(text: string): Promise<number[]> {
  const rows = await query<{ EMBEDDING: string }>(`
    SELECT SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', ?) AS EMBEDDING
  `, [text])
  return JSON.parse(rows[0].EMBEDDING) as number[]
}
