# FitCheck engine

The Python package `fitcheck`: domain types, the verdict rules, one adapter per slot (closet store, tagger, cutout, try-on, weather, calendar, stylist), the HTTP API the web app calls and the `fitcheck` CLI the agent skill drives.

## Run it

```sh
cd engine
uv sync --all-extras        # every adapter's dependencies; the core needs none of them
uv run fitcheck serve       # API on http://localhost:8000, offline on fakes by default
uv run fitcheck --help      # serve, health, scan, judge, week, chat, render, closet, add, forget, seed and openapi, all printing JSON
```

With nothing configured, the engine keeps closets in SQLite under `.fitcheck/` at the repo root, tags with a color-only fake, uses a fixture week and pastes garments flat for try-on, so a fresh clone runs with no accounts or GPU.

## Configure it

Every setting is a field in `src/fitcheck/settings.py`, read from a `FITCHECK_<FIELD>` env var or from `engine/.env`. Copy `.env.example` to `.env` (git ignores it) for keys and per-machine values. The presets in `../env/` pick adapters for the open path and the Snowflake path; `make api-open` and `make api-snowflake` load them.

## Change it

`make check` from the repo root runs ruff, mypy in strict mode and pytest; it must pass before a PR. Tests that need a real service are marked `live` and run only with `FITCHECK_LIVE=1`. After changing a route or wire schema, run `make openapi` so the web app's types follow.

Read `../AGENTS.md` for how the modules fit together and the rules every change keeps, and `../docs/adapters.md` before adding an adapter.
