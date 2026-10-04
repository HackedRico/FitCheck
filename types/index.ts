export interface UserRow {
  ID: string
  EMAIL: string
  PASSWORD_HASH: string
  DISPLAY_NAME: string | null
  LOCATION_LAT: number | null
  LOCATION_LNG: number | null
  ZIP_CODE: string | null
  CREATED_AT: string
}

export interface TasteProfileRow {
  ID: string
  USER_ID: string
  STYLE_AESTHETICS: string[] | null
  FAVORITE_COLORS: string[] | null
  AVOID_COLORS: string[] | null
  FAVORITE_BRANDS: string[] | null
  BUDGET_MIN: number | null
  BUDGET_MAX: number | null
  BODY_TYPE: string | null
  SKIN_TONE: string | null
  GENDER: string | null
  SIZE_TOPS: string | null
  SIZE_BOTTOMS: string | null
  SIZE_SHOES: string | null
  UPDATED_AT: string
}

export interface ClosetItemRow {
  ID: string
  USER_ID: string
  IMAGE_URL: string
  THUMBNAIL_URL: string | null
  CATEGORY: ClothingCategory | null
  SUBCATEGORY: string | null
  COLORS: string[] | null
  PATTERN: string | null
  MATERIAL: string | null
  FORMALITY: Formality | null
  SEASONS: Season[] | null
  AI_DESCRIPTION: string | null
  EMBEDDING: number[] | null
  AI_STATUS: 'pending' | 'complete' | 'failed'
  BRAND: string | null
  NOTES: string | null
  IS_ACTIVE: boolean
  CREATED_AT: string
}

export interface OutfitRow {
  ID: string
  USER_ID: string
  ITEM_IDS: string[]
  AI_RATIONALE: string | null
  WEATHER_CONTEXT: WeatherContext | null
  OCCASION: string
  USER_RATING: number | null
  IS_SAVED: boolean
  IS_WORN: boolean
  WORN_DATE: string | null
  GENERATED_AT: string
  OUTFIT_DATE: string
}

export interface ProductSuggestionRow {
  ID: string
  OUTFIT_ID: string | null
  USER_ID: string
  NAME: string | null
  BRAND: string | null
  PRICE: number | null
  IMAGE_URL: string | null
  PRODUCT_URL: string | null
  SOURCE: string | null
  STORE_NAME: string | null
  CATEGORY: string | null
  SUGGESTED_BECAUSE: string | null
  SEARCH_QUERY: string | null
  CREATED_AT: string
}

export type ClothingCategory =
  | 'TOP'
  | 'BOTTOM'
  | 'DRESS'
  | 'OUTERWEAR'
  | 'SHOES'
  | 'ACCESSORY'
  | 'BAG'

export type Formality = 'CASUAL' | 'SMART_CASUAL' | 'BUSINESS' | 'FORMAL'

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

export interface WeatherContext {
  temp: number
  feels_like: number
  rain_chance: number
  condition: string
}

export interface TasteProfilePayload {
  style_aesthetics: string[]
  favorite_colors: string[]
  avoid_colors: string[]
  favorite_brands: string[]
  budget_min: number
  budget_max: number
  body_type: string
  skin_tone: string
  gender: string
  size_tops: string
  size_bottoms: string
  size_shoes: string
}

export interface ClothingAnalysis {
  category: ClothingCategory
  subcategory: string
  colors: string[]
  pattern: string
  material: string
  formality: Formality
  seasons: Season[]
  description: string
}

export interface OutfitGenerationResult {
  selected_item_ids: string[]
  rationale: string
  missing_pieces: string[]
}

export interface ShoppingSuggestion {
  name: string
  brand: string
  price: number
  category: string
  source: 'online' | 'in_store'
  store_name: string
  suggested_because: string
  search_query: string
}

export interface ShoppingSuggestionsResult {
  suggestions: ShoppingSuggestion[]
}

export interface ShoppingAssistantResult {
  advice: string
  suggestions: ShoppingSuggestion[]
}

export interface CalendarEvent {
  title: string
  start: string
  formality: string
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
    }
  }

  interface User {
    id: string
    email: string
    name: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
  }
}
