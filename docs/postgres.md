# Postgres on the open path

On the open path the closet lives in Postgres 17, run by Docker from `docker-compose.yml`. The image is `pgvector/pgvector:pg17`, so vector search later needs only `CREATE EXTENSION vector`.

## Start

```sh
make db-up               # docker compose up -d postgres
docker compose ps        # wait until the status says "healthy"
make api-open            # env/open.env sets FITCHECK_STORE=postgres
```

To keep every other slot on fakes, run `FITCHECK_STORE=postgres make api` instead. The engine creates its table when it starts. If the database is down, it refuses to start with an `AdapterUnavailable` error that says to run `make db-up`.

## Connect

The engine reads `FITCHECK_DATABASE_URL`, which defaults to `postgresql://fitcheck:fitcheck@localhost:5432/fitcheck`. The port listens on 127.0.0.1 only, because the password is in this repo. For a SQL shell:

```sh
docker compose exec postgres psql -U fitcheck
```

## Seed the demo closet

The memory store loads `demo/closet.json` every time it starts. Postgres keeps what it has, so seed it once. A `fitcheck seed` command builds only the store slot from settings, then saves each seed garment:

```python
import importlib

from fitcheck.seed import load_seed
from fitcheck.settings import Settings
from fitcheck.wiring import ADAPTERS

settings = Settings()
store = importlib.import_module(ADAPTERS["store"][settings.store]).build(settings)
for garment in load_seed(settings.seed_path) if settings.seed_path else []:
    store.save(garment)
```

`save` replaces a garment with the same owner and id, so seeding twice changes nothing. Seed images stay in `demo/images/` and are never copied into the database.

## Reset

```sh
docker compose down -v   # deletes the volume and every closet in it
make db-up
```

Restart the engine afterwards so it recreates the table, then seed again. To clear one owner only, forget them through the engine, or run `DELETE FROM garments WHERE owner = 'maya';` in `psql`.

## Schema

`engine/src/fitcheck/closet/sql/postgres.sql` defines one table, `garments`, keyed by `(owner, id)` so one owner's id can never overwrite another's garment. It has one column per `Garment` field with the tags flattened out: `category`, `color_family`, `pattern`, `warmth`, `waterproof`, `formality` and `description`. `price` is an unconstrained `numeric`, so a price keeps its exact digits, and `created_at` is a `timestamptz` that the store hands back in UTC. A generated `search` column holds a `tsvector` of category, color family, pattern and description under a GIN index. `search` ranks full-text matches with `ts_rank` and, when stemming and stop words leave nothing to match, falls back to substring matching. The engine runs the file on every start; each statement uses `IF NOT EXISTS`, so changing a column needs a migration or a reset.

## Tests

From `engine/`, run `FITCHECK_LIVE=1 uv run pytest -q tests/closet`. The live tests work in a throwaway `fitcheck_test` schema and drop it at the end, so the real closet is left alone.
