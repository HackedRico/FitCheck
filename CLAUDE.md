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
- `lib/cortex.ts` — contains `analyzeClothingImage()`, `generateOutfit()`, `generateShoppingSuggestions()`, `embedText()`
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

# Team engine (optional, for try-on renders)
ENGINE_URL=http://localhost:8000
```

---

## What Is Built vs. What Is Missing

### Done (all build and type-check clean; `npm run build` passes)
- [x] Next.js 16 scaffold (App Router, TypeScript, Tailwind v4)
- [x] `lib/snowflake.ts`, `lib/weather.ts`, `lib/cloudinary.ts`, `lib/cortex.ts`, `lib/auth.ts`
- [x] Auth: `app/api/auth/[...nextauth]`, `app/api/auth/register`, login + register pages
- [x] Taste profile: `app/api/taste-profile`, onboarding + profile pages, `app/api/user/location`
- [x] Closet: upload (Cloudinary + Snowflake stage fallback), Pixtral analyze, items list, upload + grid pages
- [x] Outfit: `app/api/outfit/generate` (weather + Llama + shopping gap fillers), `app/api/outfit/[id]`, dashboard
- [x] Try-on: `app/api/tryon` + `components/TryOnCard.tsx` bridge to the team engine (`ENGINE_URL`, default `http://localhost:8000`) for `/render` and `/link`
- [x] `scripts/setup-schema.mjs` creates/migrates all Snowflake tables + the `CLOSET_IMAGES` stage

### Known gaps
- Try-on needs the Python engine running (`make api` from repo root); the card shows a clear error otherwise.
- No tests for the Next.js app. CI (`.github/workflows/ci.yml`) covers `engine/` and `web/` only.
- `PRODUCT_SUGGESTIONS.IMAGE_URL` / `PRODUCT_URL` are never populated; shopping cards link to a Google search built from `SEARCH_QUERY`.

---

## Repo Layout Note

This Next.js app lives at the repo root alongside the team's other product surfaces:
`engine/` (FastAPI, Python), `web/` (Vite PWA), `worker/`. Those have their own
lint/test setups and are excluded from the root ESLint config. See the root `README.md`.

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
