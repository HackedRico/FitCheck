# Snowflake path

The Snowflake path keeps the closet in a Snowflake table, ranks closet search with Cortex Search and runs the stylist on Cortex `AI_COMPLETE`. Garment vision and try-on stay on hosted open weights, so person photos never reach Snowflake (ADR 0001, ADR 0003).

## Setup, step by step

### 1. Get an account

Sign up for the 30-day trial at https://signup.snowflake.com. Pick AWS US West 2 (Oregon) if offered: `llama3.3-70b` runs there natively.

On a self-service trial, AI features stay off until you add a credit card under Admin, Billing. Adding a card does not end the trial or start billing ([trial accounts](https://docs.snowflake.com/en/user-guide/admin-trial-account)). Note your account identifier (bottom left in Snowsight, account menu, "Copy account identifier", shaped like `ORGNAME-ACCOUNTNAME`).

### 2. Create a key pair

Snowflake now requires a second factor for password sign-in for most users, which a server cannot answer. Trial accounts are exempt, so a password works there; a key pair works everywhere ([MFA rollout](https://docs.snowflake.com/en/user-guide/security-mfa-rollout)).

```sh
cd engine
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
grep -v "PUBLIC KEY" rsa_key.pub | tr -d '\n'; echo
```

The root `.gitignore` already ignores `*.p8` and `.env`, so the key and secrets stay out of git.

In a Snowsight worksheet, paste the last command's output into:

```sql
ALTER USER <your_user> SET RSA_PUBLIC_KEY = '<output of the grep line>';
```

### 3. Run setup.sql

Open a Snowsight SQL worksheet, paste all of `engine/sql/snowflake/setup.sql`, and run all (ctrl or cmd + shift + enter). It runs as ACCOUNTADMIN and creates role `FITCHECK`, warehouse `FITCHECK_WH`, database `FITCHECK`, table `GARMENTS` and the Cortex Search service `CLOSET_SEARCH`, then grants role `FITCHECK` to you. The last two statements are smoke checks; both must return a row. Running it again is safe.

### 4. Set the env vars

Create `engine/.env`:

```sh
FITCHECK_SNOWFLAKE_ACCOUNT=ORGNAME-ACCOUNTNAME
FITCHECK_SNOWFLAKE_USER=<your_user>
FITCHECK_SNOWFLAKE_PRIVATE_KEY_PATH=rsa_key.p8
# or, on a trial account only: FITCHECK_SNOWFLAKE_PASSWORD=...
FITCHECK_SNOWFLAKE_ROLE=FITCHECK
# llama4-maverick went legacy on 2026-08-12: accounts that never used it cannot start now
FITCHECK_CORTEX_MODEL=llama3.3-70b
```

A relative key path resolves from the folder the server starts in, which is `engine/` for `make` targets. Leave the warehouse, database, schema and service names at their defaults unless you changed `setup.sql`. If the key file is encrypted, also set `FITCHECK_SNOWFLAKE_PRIVATE_KEY_PASSPHRASE`.

### 5. Load the demo closet and start

```sh
cd engine
uv run --env-file ../env/snowflake.env fitcheck seed
uv run --env-file ../env/snowflake.env fitcheck closet
uv run --env-file ../env/snowflake.env fitcheck chat "what goes with my navy coat?"
cd .. && make api-snowflake
```

`fitcheck closet` should list the seeded garments. Cortex Search picks them up within the one-minute target lag; until then search ranks by keyword overlap and logs a warning. `GET /health` should show `snowflake-store` and `cortex-stylist` with `runs_on: snowflake`.

### 6. Closet insights

Run `engine/sql/snowflake/insights.sql` in a worksheet: cost per wear, most and least worn, garments per category, and an `AI_AGG` closet summary. The web app does not show these yet.

## How the Best Use of Snowflake examples map to FitCheck

| Challenge example | FitCheck feature | What delivers it |
| --- | --- | --- |
| RAG chatbot | The stylist chat: ask "what goes with this?" and get an answer grounded in your own closet | `SNOWFLAKE.CORTEX.SEARCH_PREVIEW` on `CLOSET_SEARCH`, filtered by `OWNER`, retrieves closet garments (`closet/snowflake.py`); `AI_COMPLETE` with `response_format` answers from those facts (`stylist/cortex.py`) |
| AI features: generation, extraction | Stylist replies as structured JSON with garment ids to render | `AI_COMPLETE(model, prompt, model_parameters, response_format => {'type': 'json', ...})` |
| AI features: summarization | Closet summary in a worksheet | `AI_AGG` over `GARMENTS` in `insights.sql` |
| Data application | Closet store and insights: cost per wear, most and least worn, category counts | `GARMENTS` table with tags as columns; queries in `insights.sql` |

## Design notes

- Search: the `GARMENTS` table decides which garments match the question (any shared word, as on the open path) and Cortex Search decides their order. A garment the index has not refreshed yet still shows, ranked after indexed ones, and a deleted one never shows. If the service is missing or fails, the store logs a warning and ranks by keyword overlap.
- All values travel as bind parameters. The connector runs with `paramstyle="pyformat"`, which escapes values on the client, because `SEARCH_PREVIEW` accepts constant arguments only.
- `AI_COMPLETE` accepts `response_format` only in its single-string form, so the system prompt, FACTS and transcript go in one prompt string.
- Every statement carries `QUERY_TAG = 'fitcheck'`, so `QUERY_HISTORY` can show FitCheck's spend.
- `FITCHECK_TAGGER=cortex` is not built yet. Vision stays on open weights.

## What we verified

Verified with fakes, without an account: the store and stylist send the SQL we expect with every owner, id and query value bound, search falls back when Cortex Search raises, and missing settings raise `AdapterUnavailable` naming the env vars (`engine/tests/snowflake/`). `ruff` and `mypy --strict` pass.

Not verified, because no account was available while writing: that `setup.sql` runs clean end to end, that `SEARCH_PREVIEW` accepts the client-bound literals, that the `response_format` object constant and `TO_TIMESTAMP_TZ` format parse, and the live contract test `TestSnowflakeClosetStoreLive`. Run it with:

```sh
cd engine && FITCHECK_LIVE=1 uv run --env-file ../env/snowflake.env pytest -q tests/snowflake
```

## Sources

- AI_COMPLETE single string, structured output: https://docs.snowflake.com/en/sql-reference/functions/ai_complete-single-string and https://docs.snowflake.com/en/user-guide/snowflake-cortex/complete-structured-outputs
- Models, regions, legacy status: https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql-regional-availability and https://docs.snowflake.com/en/release-notes/bcr-bundles/un-bundled/bcr-august-model-deprecations
- Cross-region inference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cross-region-inference
- Privileges: https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql-privileges-and-access
- Cortex Search: https://docs.snowflake.com/en/sql-reference/sql/create-cortex-search, https://docs.snowflake.com/en/sql-reference/functions/search_preview-snowflake-cortex, https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-search/query-cortex-search-service
- AI_AGG: https://docs.snowflake.com/en/sql-reference/functions/ai_agg
- Key-pair auth: https://docs.snowflake.com/en/user-guide/key-pair-auth
- Trial accounts: https://docs.snowflake.com/en/user-guide/admin-trial-account
