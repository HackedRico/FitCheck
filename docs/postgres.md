# Postgres on the open path

The default closet store is SQLite in `.fitcheck/closet.db`, which needs no server. Set `FITCHECK_STORE=postgres` to keep the closet in Postgres 17 instead, run by Docker from `docker-compose.yml`. The image is `pgvector/pgvector:pg17`, so vector search later needs only `CREATE EXTENSION vector`.

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

The sqlite store seeds the demo closet into an empty database by itself. Postgres keeps what it has, so seed it once:

```sh
cd engine && uv run --env-file ../env/open.env fitcheck seed
```

`save` replaces a garment with the same owner and id, so seeding twice changes nothing. Seed images stay in `demo/images/` and never go into the database.

## Reset

```sh
docker compose down -v   # deletes the volume and every closet in it
make db-up
```

Restart the engine afterwards so it recreates the table, then seed again. To clear one owner only, forget them through the engine, or run `DELETE FROM garments WHERE owner = 'ricky';` in `psql`.

## Schema

`engine/src/fitcheck/closet/sql/postgres.sql` defines one table, `garments`, keyed by `(owner, id)` so one owner's id can never overwrite another's garment. It has one column per `Garment` field with the tags flattened out: `category`, `color_family`, `pattern`, `warmth`, `waterproof`, `formality` and `description`, plus `source_url` for a garment brought in by shop link. `price` is an unconstrained `numeric`, so a price keeps its exact digits, and `created_at` is a `timestamptz` that the store hands back in UTC. A generated `search` column holds a `tsvector` of category, color family, pattern and description under a GIN index. `search` ranks full-text matches with `ts_rank` and, when stemming and stop words leave nothing to match, falls back to substring matching. The engine runs the file on every start; each statement uses `IF NOT EXISTS`, so adding a column takes an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line and any other change needs a reset.

## Tests

From `engine/`, run `FITCHECK_LIVE=1 uv run pytest -q tests/closet`. The live tests work in a throwaway `fitcheck_test` schema and drop it at the end, so the real closet is left alone.
