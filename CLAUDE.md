# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What This App Is

**FitCheck** — a morning outfit recommendation app. Users upload their closet, set a taste profile, and get daily AI-generated outfit suggestions based on live weather. The app also recommends online/in-store shopping options to fill wardrobe gaps.

**Hackathon tracks:**
- **Best Use of Snowflake** — all data + all AI inference runs through Snowflake Cortex (no OpenAI)
- **Best Open-Source AI** — Llama 3.1 70B (Meta) and Pixtral-Large (Mistral) are open-weight models running on Snowflake Cortex

---

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # eslint
```

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 App Router (TypeScript) |
| Database + AI | Snowflake (free trial) via `snowflake-sdk` |
| Image storage | Cloudinary (free tier) |
| Auth | NextAuth.js v4 (credentials provider) |
| Weather | Open-Meteo (free, no key needed) |
| Styling | Tailwind CSS v4 |

---

## Architecture

All backend logic lives in Next.js API routes (`app/api/`). There is no separate server. The app is designed to deploy on Vercel.

### Data flow

```
User uploads photo
  → Cloudinary (image storage, returns URL)
  → Snowflake CLOSET_ITEMS insert (pending)
  → Snowflake Cortex Pixtral-Large (vision: extract category, colors, season, formality)
  → Snowflake CORTEX.EMBED_TEXT_768 (generate embedding for semantic search)
  → Snowflake CLOSET_ITEMS update (complete)

User hits "Get My Fit"
  → Open-Meteo API (live weather for user's lat/lng)
  → Snowflake: fetch TASTE_PROFILE + all CLOSET_ITEMS for user
  → Snowflake Cortex llama3.1-70b (outfit generation prompt → selected item IDs + rationale)
  → Snowflake Cortex llama3.1-70b (shopping suggestions for missing pieces)
  → Snowflake OUTFITS + PRODUCT_SUGGESTIONS insert
  → Return to UI
```

### Snowflake Cortex models in use

- `pixtral-large` — multimodal vision, used for clothing photo analysis
- `llama3.1-70b` — text completion, used for outfit generation + shopping suggestions
- `snowflake-arctic-embed-m` — embeddings via `CORTEX.EMBED_TEXT_768()`

All AI calls are plain SQL: `SELECT SNOWFLAKE.CORTEX.COMPLETE('model', prompt)`. No separate AI API keys needed.

### Key library files

- `lib/snowflake.ts` — singleton Snowflake connection + `query<T>(sql, binds)` helper used everywhere
- `lib/cortex.ts` — **NOT YET WRITTEN** — will contain `analyzeClothingImage()`, `generateOutfit()`, `generateShoppingSuggestions()`, `embedText()`
- `lib/weather.ts` — `getWeather(lat, lng)` → Open-Meteo fetch, returns `{ temp, feels_like, rain_chance, condition }`
- `lib/cloudinary.ts` — `uploadImage(buffer, folder)` → returns `{ url, thumbnail_url, public_id }`

---

## Snowflake Setup

**Account:** `ongziuf-va80305`  
**Username:** `BALDMEYA`  
**Region:** US East 2  
**Database:** `FITCHECK`  
**Schema:** `APP`  
**Warehouse:** `COMPUTE_WH`

Run the full schema SQL from `PLAN.md` → "Snowflake Schema" section in a Snowflake worksheet before starting. Tables: `USERS`, `TASTE_PROFILES`, `CLOSET_ITEMS`, `OUTFITS`, `PRODUCT_SUGGESTIONS`.

Snowflake Cortex must be enabled — it is available by default on US East 2 free trial accounts.

---

## Environment Variables

Create `.env.local` in the project root (never commit this):

```bash
# Snowflake
SNOWFLAKE_ACCOUNT=ongziuf-va80305
SNOWFLAKE_USERNAME=BALDMEYA
SNOWFLAKE_PASSWORD=<your password>
SNOWFLAKE_DATABASE=FITCHECK
SNOWFLAKE_SCHEMA=APP
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_ROLE=ACCOUNTADMIN

# Cloudinary (get from cloudinary.com dashboard)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# NextAuth
NEXTAUTH_SECRET=fitcheck-hackathon-secret-key-2024
NEXTAUTH_URL=http://localhost:3000
```

---

## What Is Built vs. What Is Missing

### Done
- [x] Next.js 16 scaffold (App Router, TypeScript, Tailwind)
- [x] Dependencies installed: `snowflake-sdk`, `next-auth`, `bcryptjs`, `cloudinary`
- [x] `lib/snowflake.ts` — Snowflake connection + query helper
- [x] `lib/weather.ts` — Open-Meteo weather fetch
- [x] `lib/cloudinary.ts` — Cloudinary image upload

### Still needs to be built (in order)

1. **`lib/cortex.ts`** — Snowflake Cortex AI wrappers (see PLAN.md for full implementation)
2. **`app/api/auth/[...nextauth]/route.ts`** — NextAuth credentials provider (look up user in Snowflake `USERS` table, compare bcrypt hash)
3. **`app/api/auth/register/route.ts`** — POST: create user in Snowflake
4. **`app/(auth)/login/page.tsx`** and **`app/(auth)/register/page.tsx`**
5. **`app/api/taste-profile/route.ts`** — GET + POST: upsert `TASTE_PROFILES` in Snowflake
6. **`app/(app)/onboarding/page.tsx`** — multi-step taste profile form
7. **`app/api/closet/upload/route.ts`** — receive image → Cloudinary → Snowflake insert → trigger analyze
8. **`app/api/closet/analyze/route.ts`** — Pixtral vision call → update CLOSET_ITEMS
9. **`app/api/closet/items/route.ts`** — GET all closet items for user
10. **`app/(app)/closet/upload/page.tsx`** — upload UI with drag-and-drop
11. **`app/(app)/closet/page.tsx`** — closet grid view
12. **`app/api/outfit/generate/route.ts`** — full outfit generation (weather + Llama + shopping)
13. **`app/(app)/dashboard/page.tsx`** — morning feed with outfit card + shopping suggestions
14. **`app/(app)/layout.tsx`** — protected layout (redirect to login if no session)

---

## Important Implementation Notes

- **Snowflake column names come back UPPERCASE** from `snowflake-sdk`. Always access them as `row.ID`, `row.USER_ID`, `row.IMAGE_URL` etc.
- **`lib/snowflake.ts` uses a module-level singleton connection.** In Next.js API routes this works fine — each route handler reuses the same connection if it's still up.
- **Cortex COMPLETE returns a string**, not JSON. Always parse with `JSON.parse(text.match(/\{[\s\S]*\}/)?.[0])` and handle parse failures.
- **Pixtral vision call syntax** (multimodal, image URL in content array) differs from the text-only COMPLETE call — see PLAN.md `lib/cortex.ts` for the exact SQL.
- **NextAuth v4** is installed (not v5). Use the v4 API: `getServerSession(authOptions)` in server components/API routes.
- **Tailwind v4** is installed — config is in `postcss.config.mjs`, not `tailwind.config.js`. The v4 API differs from v3.

---

## Full Plan

See `PLAN.md` for: complete Snowflake schema SQL, full `lib/cortex.ts` implementation, all API route logic, page flows, build order, and the demo script for judges.
