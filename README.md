# FitCheck

A second opinion in the fitting-room line. Point your phone at a garment, see it on you, and get **BUY, SKIP or TRY-WITH** against your closet, this week's weather and your calendar.

Garment vision and chat run on open-weight models (Apache 2.0) through any OpenAI-compatible host, including your own server. Your body photo goes only to the try-on renderer and is never stored.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) for the engine (`brew install uv` on macOS). It fetches Python 3.12 itself if you don't have it.
- Node.js 20.19+ or 22.12+ with npm, for the web app.
- `make`, which ships with macOS and Linux.

The offline flow needs nothing else. The open path (`make api-open`) also needs Docker for Postgres (`make db-up`) and a running try-on worker (see `worker/README.md`). The Snowflake path needs a Snowflake account (see `docs/snowflake.md`).

## Run it

```bash
make sync          # engine dependencies
make web-install   # web app dependencies
make dev           # engine on :8000 and web app on :5173 together; Ctrl+C stops both
```

Or run them in two terminals with `make api` and `make web`. Open https://localhost:5173 and accept the self-signed certificate once. On your phone, use the Network URL Vite prints, on the same Wi-Fi; the camera only works over https.

With nothing configured the whole flow runs offline. Closets, and the photos and shop links people add, are saved in `.fitcheck/` (a SQLite file plus the garment images), so they survive restarts; delete that folder to start from the demo closet again. To use real models, copy `engine/.env.example` to `engine/.env` and set the keys, then start the engine with `make api-open` or `make api-snowflake`. Keys alone don't switch anything: those targets load `env/open.env` or `env/snowflake.env`, which move every slot off the fakes at once.

## How it decides

Plain rules decide the verdict, so the demo repeats exactly; the stylist model explains it. A candidate that fills a gap in your week, such as rain with no rain shell, is a BUY. Two near duplicates in your closet is a SKIP. Details in `docs/verdict-rules.md`.

## Two tracks, one repo

- **Open source:** open-weight models only, Postgres, a public repo under Apache 2.0, and the `fit-check` agent skill in `skills/`.
- **Snowflake:** the closet lives in Snowflake, Cortex Search retrieves closet garments and Cortex AI_COMPLETE answers as the stylist, a RAG chatbot over your own data. See `docs/snowflake.md`.

## One demo, two moments

FitCheck covers both moments a person decides what to wear.

| Moment | Surface | Port |
|---|---|---|
| Morning: "what do I wear today?" | Next.js app at the repo root. Closet, taste profile, live weather, calendar, daily outfit, gap fillers, try-on. | 3000 |
| In store: "should I buy this?" | PWA in `web/` on the engine in `engine/`. Scan, verdict, stylist chat, live try-on. | 5173 |

Both use the same engine for the weather week, try-on renders and shop links. The morning app's **In Store** link opens the PWA.

```bash
make demo-install     # once
make demo             # engine :8000, PWA :5173, morning app :3000
make demo-snowflake   # same, engine on Snowflake Cortex
```

Demo script: register in the morning app, upload three garments, open the dashboard for today's fit and the gap fillers, press Try It On, then click In Store and scan one of the gap fillers for a BUY verdict.

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
