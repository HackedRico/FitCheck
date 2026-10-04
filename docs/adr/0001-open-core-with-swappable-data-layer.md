# Open core with a swappable data layer

We enter both Best Open-Source AI Project and Best Use of Snowflake from one repo. Every model step runs on open-weight models, and the closet store, closet search and stylist sit behind adapter slots that `FITCHECK_*` env vars switch between the open path (Postgres, open-weight models over an OpenAI-compatible API) and the Snowflake path (Snowflake tables, Cortex Search, Cortex AI_COMPLETE). A Snowflake-first build would score lower with open-source judges, and an open-only build cannot enter the Snowflake track.

## Consequences

- Both paths must give the same verdict for the same closet, because the rules run in Python on either path.
- Garment vision and try-on stay off Snowflake on both paths, so person photos never reach it.
