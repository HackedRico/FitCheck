# FitCheck — End-to-End Hackathon Plan

## What It Does
FitCheck is a morning outfit recommendation app. Users upload their closet, fill out a taste profile, and every day the app pulls live weather data and uses AI to suggest the perfect outfit. It also recommends online/in-store shopping options to fill wardrobe gaps.

## Hackathon Tracks
- **Best Use of Snowflake** — All data lives in Snowflake. All AI runs via Snowflake Cortex (Pixtral for vision, Llama 3.1 for outfit generation). Single API, no stitching.
- **Best Open-Source AI** — Llama 3.1 70B (Meta, open-weight) and Pixtral-Large (Mistral, open-weight) are the core AI. Repo is public with an open-source license.

---

## Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend + API | Next.js 14 (App Router, TypeScript) | Full-stack in one repo, instant Vercel deploy |
| Database + AI | Snowflake (free trial) | Cortex LLMs, vector search, all data in one place |
| Image storage | Cloudinary (free tier) | Snowflake can't serve images; Cloudinary is free forever |
| Auth | NextAuth.js (credentials) | No extra service; user records stored in Snowflake |
| Weather | Open-Meteo | Free, no API key, accurate |
| Styling | Tailwind CSS + shadcn/ui | Fast, clean UI |
| Deploy | Vercel (free tier) | One command deploy |

---

## Project Structure

```
fitcheck/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              # Protected layout with nav
│   │   ├── onboarding/page.tsx     # Taste profile wizard
│   │   ├── dashboard/page.tsx      # Morning fit recommendation
│   │   ├── closet/
│   │   │   ├── page.tsx            # Closet grid view
│   │   │   └── upload/page.tsx     # Upload flow
│   │   ├── profile/page.tsx        # Self photos + taste profile edit
│   │   └── shop/page.tsx           # Shopping suggestions
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── closet/
│       │   ├── upload/route.ts     # Cloudinary upload + Snowflake insert
│       │   ├── analyze/route.ts    # Snowflake Cortex Pixtral vision call
│       │   └── items/route.ts      # CRUD for closet items
│       ├── outfit/
│       │   └── generate/route.ts   # Main outfit generation endpoint
│       ├── weather/route.ts        # Open-Meteo fetch
│       ├── taste-profile/route.ts  # Save/fetch taste profile
│       └── shop/route.ts           # Shopping suggestions via Cortex
├── components/
│   ├── OutfitCard.tsx
│   ├── ClosetGrid.tsx
│   ├── ClosetItemCard.tsx
│   ├── TasteProfileForm.tsx
│   ├── UploadZone.tsx
│   └── ShoppingCard.tsx
├── lib/
│   ├── snowflake.ts               # Snowflake connection + query helper
│   ├── cloudinary.ts              # Upload helper
│   ├── weather.ts                 # Open-Meteo fetch
│   └── cortex.ts                  # Snowflake Cortex AI helpers
├── types/
│   └── index.ts
├── .env.local
├── next.config.ts
└── package.json
```

---

## Snowflake Schema

Run these in your Snowflake worksheet before starting:

```sql
-- Database + schema setup
CREATE DATABASE FITCHECK;
CREATE SCHEMA FITCHECK.APP;
USE SCHEMA FITCHECK.APP;

-- Users table
CREATE TABLE USERS (
  id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  display_name VARCHAR,
  location_lat FLOAT,
  location_lng FLOAT,
  zip_code VARCHAR,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Taste profiles (1:1 with users)
CREATE TABLE TASTE_PROFILES (
  id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
  user_id VARCHAR UNIQUE NOT NULL REFERENCES USERS(id),
  style_aesthetics ARRAY,           -- ['minimalist', 'streetwear']
  favorite_colors ARRAY,            -- ['navy', 'earth tones']
  avoid_colors ARRAY,
  favorite_brands ARRAY,            -- ['Zara', 'Uniqlo']
  budget_min INTEGER,               -- per item, in dollars
  budget_max INTEGER,
  body_type VARCHAR,                -- user-declared
  skin_tone VARCHAR,                -- user-declared
  gender VARCHAR,
  size_tops VARCHAR,
  size_bottoms VARCHAR,
  size_shoes VARCHAR,
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Closet items
CREATE TABLE CLOSET_ITEMS (
  id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
  user_id VARCHAR NOT NULL REFERENCES USERS(id),
  image_url VARCHAR NOT NULL,       -- Cloudinary URL
  thumbnail_url VARCHAR,            -- Cloudinary thumbnail
  -- AI-extracted by Pixtral
  category VARCHAR,                 -- TOP, BOTTOM, DRESS, OUTERWEAR, SHOES, ACCESSORY
  subcategory VARCHAR,              -- 'crew neck sweater', 'straight leg jeans'
  colors ARRAY,
  pattern VARCHAR,                  -- 'solid', 'striped', 'plaid'
  material VARCHAR,
  formality VARCHAR,                -- CASUAL, SMART_CASUAL, BUSINESS, FORMAL
  seasons ARRAY,                    -- ['spring', 'fall']
  ai_description VARCHAR,          -- one-line summary for embedding
  embedding VECTOR(FLOAT, 768),    -- Cortex embed for semantic search
  ai_status VARCHAR DEFAULT 'pending', -- pending, complete, failed
  brand VARCHAR,                    -- user-added
  notes VARCHAR,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Generated outfits
CREATE TABLE OUTFITS (
  id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
  user_id VARCHAR NOT NULL REFERENCES USERS(id),
  item_ids ARRAY,                   -- array of CLOSET_ITEMS.id
  ai_rationale VARCHAR,             -- why this outfit works
  weather_context VARIANT,          -- { temp, condition, feels_like }
  occasion VARCHAR DEFAULT 'daily',
  user_rating INTEGER,              -- 1-5
  is_saved BOOLEAN DEFAULT FALSE,
  is_worn BOOLEAN DEFAULT FALSE,
  worn_date DATE,
  generated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  outfit_date DATE DEFAULT CURRENT_DATE()
);

-- Product suggestions linked to outfits
CREATE TABLE PRODUCT_SUGGESTIONS (
  id VARCHAR PRIMARY KEY DEFAULT UUID_STRING(),
  outfit_id VARCHAR REFERENCES OUTFITS(id),
  user_id VARCHAR NOT NULL REFERENCES USERS(id),
  name VARCHAR,
  brand VARCHAR,
  price INTEGER,                    -- in dollars
  image_url VARCHAR,
  product_url VARCHAR,
  source VARCHAR,                   -- 'online', 'in_store'
  store_name VARCHAR,
  category VARCHAR,
  suggested_because VARCHAR,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
```

---

## Environment Variables

```bash
# .env.local

# Snowflake
SNOWFLAKE_ACCOUNT=your-account-identifier   # e.g. abc12345.us-east-1
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_DATABASE=FITCHECK
SNOWFLAKE_SCHEMA=APP
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_ROLE=ACCOUNTADMIN               # or your role

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# NextAuth
NEXTAUTH_SECRET=any-random-string-32-chars
NEXTAUTH_URL=http://localhost:3000
```

---

## Core Library Files

### `lib/snowflake.ts`
Snowflake connection using `snowflake-sdk`. Exports a `query(sql, binds)` helper used everywhere.

```typescript
import snowflake from 'snowflake-sdk'

const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  username: process.env.SNOWFLAKE_USERNAME!,
  password: process.env.SNOWFLAKE_PASSWORD!,
  database: process.env.SNOWFLAKE_DATABASE!,
  schema: process.env.SNOWFLAKE_SCHEMA!,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
  role: process.env.SNOWFLAKE_ROLE,
})

export async function query<T = any>(sql: string, binds: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!connection.isUp()) {
      connection.connect((err) => {
        if (err) return reject(err)
        executeQuery()
      })
    } else {
      executeQuery()
    }

    function executeQuery() {
      connection.execute({
        sqlText: sql,
        binds,
        complete: (err, _stmt, rows) => {
          if (err) return reject(err)
          resolve(rows as T[])
        }
      })
    }
  })
}
```

### `lib/cortex.ts`
Wrappers for Snowflake Cortex AI functions — vision analysis and text completion.

```typescript
import { query } from './snowflake'

// Analyze a clothing image using Pixtral-Large (vision model)
export async function analyzeClothingImage(imageUrl: string) {
  const prompt = `
    You are a fashion expert. Analyze this clothing item and return ONLY valid JSON:
    {
      "category": "TOP | BOTTOM | DRESS | OUTERWEAR | SHOES | ACCESSORY | BAG",
      "subcategory": "specific item name e.g. crew neck sweater",
      "colors": ["color1", "color2"],
      "pattern": "solid | striped | plaid | floral | graphic | other",
      "material": "estimated material e.g. cotton, denim, wool",
      "formality": "CASUAL | SMART_CASUAL | BUSINESS | FORMAL",
      "seasons": ["spring", "summer", "fall", "winter"],
      "description": "one sentence describing this item for outfit matching"
    }
  `

  const rows = await query<{ RESPONSE: string }>(`
    SELECT SNOWFLAKE.CORTEX.COMPLETE(
      'pixtral-large',
      [
        {
          'role': 'user',
          'content': [
            { 'type': 'image_url', 'image_url': { 'url': ? } },
            { 'type': 'text', 'text': ? }
          ]
        }
      ]
    ) AS response
  `, [imageUrl, prompt])

  const text = rows[0].RESPONSE
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return JSON.parse(jsonMatch![0])
}

// Generate an outfit recommendation using Llama 3.1
export async function generateOutfit(params: {
  closetItems: any[]
  tasteProfile: any
  weather: any
  occasion?: string
}) {
  const { closetItems, tasteProfile, weather, occasion = 'daily' } = params

  const prompt = `
You are a personal stylist. Generate a complete outfit from the user's wardrobe.

USER STYLE PROFILE:
- Aesthetics: ${tasteProfile.style_aesthetics?.join(', ')}
- Favorite colors: ${tasteProfile.favorite_colors?.join(', ')}
- Brands they like: ${tasteProfile.favorite_brands?.join(', ')}
- Body type: ${tasteProfile.body_type}
- Skin tone: ${tasteProfile.skin_tone}
- Occasion: ${occasion}

TODAY'S WEATHER:
- Temperature: ${weather.temp}°F (feels like ${weather.feels_like}°F)
- Condition: ${weather.condition}
- Rain chance: ${weather.rain_chance}%

AVAILABLE WARDROBE:
${JSON.stringify(closetItems.map(i => ({
  id: i.ID,
  category: i.CATEGORY,
  subcategory: i.SUBCATEGORY,
  colors: i.COLORS,
  pattern: i.PATTERN,
  formality: i.FORMALITY,
  seasons: i.SEASONS
})), null, 2)}

Rules:
- Pick at minimum: one top, one bottom (or dress), one shoes
- Must be weather-appropriate
- Colors must complement each other
- Match the user's aesthetic profile
- Return ONLY valid JSON:
{
  "selected_item_ids": ["id1", "id2", "id3"],
  "rationale": "2-3 sentence explanation of why this outfit works",
  "missing_pieces": ["item type the user is missing for this look"]
}
  `

  const rows = await query<{ RESPONSE: string }>(`
    SELECT SNOWFLAKE.CORTEX.COMPLETE('llama3.1-70b', ?) AS response
  `, [prompt])

  const text = rows[0].RESPONSE
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return JSON.parse(jsonMatch![0])
}

// Generate shopping suggestions using Llama 3.1
export async function generateShoppingSuggestions(params: {
  missingPieces: string[]
  tasteProfile: any
  currentOutfit: any[]
}) {
  const { missingPieces, tasteProfile, currentOutfit } = params

  const prompt = `
You are a fashion shopping assistant. Suggest specific products to complete this outfit.

MISSING PIECES NEEDED: ${missingPieces.join(', ')}

USER PREFERENCES:
- Style: ${tasteProfile.style_aesthetics?.join(', ')}
- Budget per item: $${tasteProfile.budget_min} - $${tasteProfile.budget_max}
- Favorite brands: ${tasteProfile.favorite_brands?.join(', ')}
- Size tops: ${tasteProfile.size_tops}, bottoms: ${tasteProfile.size_bottoms}, shoes: ${tasteProfile.size_shoes}

CURRENT OUTFIT COLORS: ${currentOutfit.map(i => i.COLORS).flat().join(', ')}

For each missing piece, suggest 2 products (1 online, 1 in-store option). Return ONLY valid JSON:
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
      "search_query": "search term to find this on Google"
    }
  ]
}
  `

  const rows = await query<{ RESPONSE: string }>(`
    SELECT SNOWFLAKE.CORTEX.COMPLETE('llama3.1-70b', ?) AS response
  `, [prompt])

  const text = rows[0].RESPONSE
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return JSON.parse(jsonMatch![0])
}

// Generate embedding for semantic closet search
export async function embedText(text: string): Promise<number[]> {
  const rows = await query<{ EMBEDDING: number[] }>(`
    SELECT SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', ?) AS embedding
  `, [text])
  return rows[0].EMBEDDING
}
```

### `lib/weather.ts`
```typescript
export async function getWeather(lat: number, lng: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation_probability,weathercode&temperature_unit=fahrenheit`
  const res = await fetch(url)
  const data = await res.json()
  const current = data.current

  const weatherCodes: Record<number, string> = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    51: 'light drizzle', 61: 'light rain', 71: 'light snow', 80: 'rain showers',
    95: 'thunderstorm'
  }

  return {
    temp: Math.round(current.temperature_2m),
    feels_like: Math.round(current.apparent_temperature),
    rain_chance: current.precipitation_probability,
    condition: weatherCodes[current.weathercode] || 'mixed conditions'
  }
}
```

### `lib/cloudinary.ts`
```typescript
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function uploadImage(
  file: Buffer,
  folder: string
): Promise<{ url: string; thumbnail_url: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: `fitcheck/${folder}`,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
      },
      (err, result) => {
        if (err || !result) return reject(err)
        const thumbnail_url = cloudinary.url(result.public_id, {
          width: 400, height: 400, crop: 'fill', quality: 'auto'
        })
        resolve({ url: result.secure_url, thumbnail_url })
      }
    ).end(file)
  })
}
```

---

## API Routes

### `POST /api/closet/upload`
1. Receive image file from client
2. Upload to Cloudinary → get `image_url`
3. Insert row in `CLOSET_ITEMS` with `ai_status = 'pending'`
4. Call `/api/closet/analyze` async (or inline for hackathon)
5. Return item id

### `POST /api/closet/analyze`
1. Fetch item by id
2. Call `analyzeClothingImage(image_url)` → Pixtral via Cortex
3. Generate embedding via `embedText(description)`
4. Update `CLOSET_ITEMS` row with all extracted attributes + embedding
5. Set `ai_status = 'complete'`

### `POST /api/outfit/generate`
1. Get user id from session
2. Fetch taste profile from Snowflake
3. Fetch all active closet items for user
4. Fetch weather via `getWeather(lat, lng)`
5. Call `generateOutfit({ closetItems, tasteProfile, weather })`
6. Insert into `OUTFITS` table
7. Call `generateShoppingSuggestions` for missing pieces
8. Insert suggestions into `PRODUCT_SUGGESTIONS`
9. Return full outfit + suggestions

### `GET /api/outfit/generate`
- Check if an outfit already exists for today for this user
- If yes, return cached outfit from Snowflake
- If no, trigger generation

### `POST /api/taste-profile`
- Upsert `TASTE_PROFILES` row for current user

### `GET /api/closet/items`
- Return all active closet items for current user

---

## Page Flows

### Onboarding (`/onboarding`)
Multi-step form collecting:
1. Style aesthetics (pill select: minimalist, streetwear, preppy, boho, classic, Y2K)
2. Favorite + avoid colors (color swatches)
3. Favorite brands (text input with suggestions)
4. Budget range (slider: $0–$500)
5. Sizes (tops, bottoms, shoes dropdowns)
6. Body type + skin tone (optional, declared by user)

On submit → `POST /api/taste-profile` → redirect to `/closet/upload`

### Closet Upload (`/closet/upload`)
- Drag-and-drop or file picker (accept: image/*)
- Show upload progress
- After upload, show AI categorization result with edit option
- User can correct any field before saving
- "Upload another" or "Go to My Fit"

### Dashboard (`/dashboard`)
- Shows today's outfit (or loading state while generating)
- Outfit card: photo grid of selected items + rationale text
- Weather strip at top: "58°F, partly cloudy"
- Action buttons: Save, Worn Today, Regenerate
- Below outfit: Shopping suggestions ("Complete this look")
- Each suggestion has: image, name, brand, price, "Find it" button

### Closet (`/closet`)
- Grid of all uploaded items with thumbnails
- Each card shows: photo, category, colors
- Tap to view/edit details
- FAB to upload new item

### Profile (`/profile`)
- Edit taste profile
- Upload self photos (for reference)
- Account settings

---

## Build Order (do this in sequence)

### Step 1 — Project scaffold
```bash
npx create-next-app@latest fitcheck --typescript --tailwind --app --src-dir no
cd fitcheck
npx shadcn@latest init
npx shadcn@latest add button card input label badge progress toast
npm install snowflake-sdk cloudinary next-auth bcryptjs
npm install -D @types/bcryptjs
```

### Step 2 — Snowflake setup
- Create free trial account at snowflake.com
- Open a worksheet, run the schema SQL above
- Copy account identifier, username, password to `.env.local`

### Step 3 — Cloudinary setup
- Create free account at cloudinary.com
- Copy cloud name, API key, API secret to `.env.local`

### Step 4 — Core libraries
- Write `lib/snowflake.ts`
- Write `lib/cortex.ts`
- Write `lib/weather.ts`
- Write `lib/cloudinary.ts`

### Step 5 — Auth
- Write `app/api/auth/[...nextauth]/route.ts` (credentials provider, look up user in Snowflake)
- Write register endpoint `app/api/auth/register/route.ts`
- Write login + register pages

### Step 6 — Taste profile
- Write `app/api/taste-profile/route.ts`
- Write `app/onboarding/page.tsx` (multi-step form)

### Step 7 — Closet upload
- Write `app/api/closet/upload/route.ts`
- Write `app/api/closet/analyze/route.ts`
- Write `app/api/closet/items/route.ts`
- Write `app/closet/upload/page.tsx`
- Write `components/UploadZone.tsx`

### Step 8 — Outfit generation
- Write `app/api/outfit/generate/route.ts`
- Write `app/dashboard/page.tsx`
- Write `components/OutfitCard.tsx`
- Write `components/ShoppingCard.tsx`

### Step 9 — Closet grid view
- Write `app/closet/page.tsx`
- Write `components/ClosetGrid.tsx`
- Write `components/ClosetItemCard.tsx`

### Step 10 — Polish + deploy
- Add loading states everywhere
- Add error handling
- `vercel deploy`
- Test full flow end to end

---

## Key Snowflake Cortex Notes

- **Pixtral-Large**: multimodal vision model (Mistral, open-weight). Used for clothing photo analysis.
- **llama3.1-70b**: Meta Llama 3.1 70B (open-weight). Used for outfit generation and shopping suggestions.
- **snowflake-arctic-embed-m**: embedding model for semantic closet search.
- All models are called via SQL functions — no separate API endpoint or key needed.
- Cortex is available on Snowflake free trial in supported regions (US regions work; confirm your trial region supports Cortex).

---

## Open-Source AI Compliance (for judging)

The project's core intelligence is powered by:
- **Meta Llama 3.1 70B** — [Llama 3 Community License](https://llama.meta.com/llama3/license/), open-weight
- **Pixtral-Large** by Mistral — open-weight

Add to `README.md`:
- Project description + demo GIF
- "AI Stack" section calling out Llama + Pixtral explicitly
- Open-source license (MIT) in `LICENSE` file
- Make repo public before submission

---

## What Could Go Wrong + Fixes

| Risk | Fix |
|---|---|
| Snowflake Cortex not available in your trial region | Switch region to US East or US West when creating trial |
| Pixtral vision call fails | Fall back to llama3.1-70b with a text description the user types |
| Closet analysis is slow (10-15s) | Show animated loading state; analyze inline for hackathon, async queue for production |
| User has < 3 closet items | Generate outfit that mixes closet items + shopping suggestions |
| Snowflake connection timeout | Use connection pooling or REST API via `fetch` to Snowflake SQL API instead of SDK |

---

## Demo Script (for judges)

1. Open app → sign in
2. Show onboarding: pick aesthetics, colors, budget
3. Upload 3-4 clothing photos → show AI categorizing each one in real time
4. Hit "Get My Fit" → show weather pulling (58°F, partly cloudy)
5. Show outfit card: photos of selected items + Llama's rationale
6. Show shopping suggestions below ("You're missing formal shoes — here are 2 options")
7. Hit "Regenerate" → different outfit appears
8. Show closet grid with all uploaded items

Total demo time: ~3 minutes
