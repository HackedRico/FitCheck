# FitCheck

A second opinion in the fitting-room line. Scan a garment or paste a shop link, see it on you, and get BUY, SKIP or TRY-WITH against your closet, the week's weather and your plans. The same engine runs on the open path or the Snowflake path (ADR 0001).

Use the words in `CONTEXT.md` for code, docs, commits and UI copy. Decisions with reasons live in `docs/adr/`; read them before reversing one.

## Map

| Path | Holds |
| --- | --- |
| `engine/` | Python package `fitcheck`: domain types, verdict rules, adapters, HTTP API, CLI |
| `web/` | Vite + React PWA: camera, live preview, verdict, closet, chat |
| `worker/` | Try-on worker the `remote` adapter calls; only an `echo` backend ships |
| `skills/fit-check/` | Agent skill that drives the engine from a shell |
| `demo/` | Seed closet for the demo owner `ricky`, and its photos |
| `env/` | Adapter presets: `open.env`, `snowflake.env` |
| `docs/` | ADRs and setup guides |

`web/`, `worker/` and `demo/` each have a `README.md` on how to run and change that part.

## How the engine fits together

In `engine/src/fitcheck/`: `domain.py` holds every shared type, `ports.py` holds the seams (one `Protocol` per slot), `engine.py` is the one module callers use, `wiring.py` fills each slot with an adapter chosen by a `FITCHECK_*` env var from `settings.py`, and `api/app.py` is a thin HTTP layer over the engine.

These hold everywhere:

- Person photos stay in memory. Only `Engine.render` and try-on adapters touch one, and nothing writes it to a database, Snowflake or a log, or to disk outside the `hf_space` temp folder (ADR 0003).
- Rules decide, models explain. `fitcheck.verdict.decide` is pure; the stylist states its verdict and never overrides it (ADR 0002).
- Every adapter reports where it runs in `AdapterInfo.runs_on`. The privacy badge in the UI reads it, so set it truthfully.
- `domain.py` and `ports.py` are shared by everyone. Change them in a PR of their own and say so in the title.

Before adding an adapter or a new slot value, read `docs/adapters.md`.

## Commands

`make help` lists every target. The ones you need: `make dev` runs the engine and web app together, `make check` runs lint, types and tests (green before every PR), `make openapi` regenerates `web/openapi.json` after any route or schema change.

With nothing configured the engine runs offline on fakes. Real adapters are picked in `engine/.env`, which `Settings` reads from any working folder; `engine/.env.example` lists every switch. The closet persists in `.fitcheck/closet.db`, and the demo closet loads only into an empty one, so delete that file to reseed.

## Code style

- Python: a module overview banner after the imports, a one-line docstring on every public function, full type hints that pass `mypy --strict`, and the specific error class from `fitcheck.errors`.
- Comments state why, never what.
- Tests live in `engine/tests/<area>/`. Mark any test that needs a real service with `@pytest.mark.live`.
- Prose in docs, commits and UI: no em or en dashes, straight quotes, sentence case headings.

## Git

- Conventional Commits with the area as scope: `feat(verdict): add cold-weather gap`, `fix(web): keep camera on rotate`.
- One branch per change and a PR into `main`.
