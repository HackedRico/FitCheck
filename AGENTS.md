# FitCheck

A second opinion in the fitting-room line. Point a phone at a garment, see it on you, and get BUY, SKIP or TRY-WITH against your closet, the week's weather and your plans. One repo enters two hackathon tracks: Best Open-Source AI Project and Best Use of Snowflake.

Use the words in `CONTEXT.md` for code, docs, commits and UI copy. Decisions with reasons live in `docs/adr/`; read them before reversing one.

## Map

| Path | Holds |
| --- | --- |
| `engine/` | Python package `fitcheck`: domain types, verdict rules, adapters, HTTP API, CLI |
| `web/` | Vite + React PWA: camera, live preview, verdict, closet, chat |
| `worker/` | Try-on GPU worker (Leffa, CatVTON) for Colab, Kaggle, Modal or a local GPU |
| `skills/fit-check/` | Agent skill that drives the engine from a shell |
| `demo/` | Seed closet and stage props |
| `env/` | Adapter presets: `open.env`, `snowflake.env` |
| `docs/` | ADRs and setup guides |

Each folder's `README.md` covers how to run and change that part.

## How the engine fits together

In `engine/src/fitcheck/`: `domain.py` holds every shared type, `ports.py` holds the seams (one `Protocol` per slot), `engine.py` is the one module callers use, `wiring.py` fills each slot with an adapter chosen by a `FITCHECK_*` env var from `settings.py`, and `api/app.py` is a thin HTTP layer over the engine.

These hold everywhere:

- Person photos stay in memory. Only `Engine.render` and try-on adapters touch one, and nothing writes it to disk, a database, Snowflake or a log (ADR 0003).
- Rules decide, models explain. `fitcheck.verdict.decide` is pure; the stylist states its verdict and never overrides it (ADR 0002).
- Every adapter reports where it runs in `AdapterInfo.runs_on`. The privacy badge in the UI reads it, so set it truthfully.
- `domain.py` and `ports.py` are shared by everyone. Change them in a PR of their own and say so in the title.

Before adding an adapter or a new slot value, read `docs/adapters.md`.

## Commands

`make help` lists every target. The three you need: `make api` runs the engine offline with fakes, `make check` runs lint, types and tests (green before every PR), `make openapi` regenerates `web/openapi.json` after any route or schema change.

## Code style

- Python: a module overview banner after the imports, a one-line docstring on every public function, full type hints that pass `mypy --strict`, and the specific error class from `fitcheck.errors`.
- Comments state why, never what.
- Tests live in `engine/tests/<area>/`. Mark any test that needs a real service with `@pytest.mark.live`.
- Prose in docs, commits and UI: no em or en dashes, straight quotes, sentence case headings.

## Git

- Conventional Commits with the area as scope: `feat(verdict): add cold-weather gap`, `fix(web): keep camera on rotate`.
- One branch per change and a PR into `main`.
