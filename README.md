# FitCheck

A second opinion in the fitting-room line. Point your phone at a garment, see it on you, and get **BUY, SKIP or TRY-WITH** against your closet, this week's weather and your calendar.

Garment vision and chat run on open-weight models (Apache 2.0) through any OpenAI-compatible host, including your own server. Your body photo goes only to the try-on renderer and is never stored.

## Run it

```bash
make sync          # engine dependencies
make api           # engine on :8000, offline: fakes, demo closet, demo week
make web-install
make web           # https://localhost:5173, or the network URL on your phone
```

With nothing configured the whole flow runs offline. Closets, and the photos and shop links people add, are saved in `.fitcheck/` (a SQLite file plus the garment images), so they survive restarts; delete that folder to start from the demo closet again. To use real models, copy `engine/.env.example` to `engine/.env` and set the keys; `env/open.env` and `env/snowflake.env` switch every slot at once (`make api-open`, `make api-snowflake`).

## How it decides

Plain rules decide the verdict, so the demo repeats exactly; the stylist model explains it. A candidate that fills a gap in your week, such as rain with no rain shell, is a BUY. Two near duplicates in your closet is a SKIP. Details in `docs/verdict-rules.md`.

## Two tracks, one repo

- **Open source:** open-weight models only, Postgres, a public repo under Apache 2.0, and the `fit-check` agent skill in `skills/`.
- **Snowflake:** the closet lives in Snowflake, Cortex Search retrieves closet garments and Cortex AI_COMPLETE answers as the stylist, a RAG chatbot over your own data. See `docs/snowflake.md`.

## Morning outfit app (Next.js, Snowflake Cortex)

A second surface in this repo, at the repo root: upload your closet, set a taste profile, and get a daily outfit from live weather plus shopping suggestions for the gaps. Every AI call is Snowflake Cortex SQL (`pixtral-large` for garment vision, `llama3.1-70b` for the outfit and shopping, `EMBED_TEXT_768` for search). It can also call the engine above for try-on renders.

```bash
npm install
cp .env.local.example .env.local   # or see CLAUDE.md for the variables
node scripts/setup-schema.mjs      # creates the Snowflake tables + stage, safe to re-run
npm run dev                        # http://localhost:3000
make api                           # optional: engine on :8000 for the Try It On card
```

Details in `CLAUDE.md`.

## For the team

Start with `AGENTS.md`, then `CONTEXT.md` for the vocabulary. Run `make check` before every PR. Models and licenses are in `THIRD_PARTY_LICENSES.md`.
