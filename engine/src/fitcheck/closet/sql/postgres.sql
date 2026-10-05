-- Closet schema for the open path, run by `PostgresClosetStore.ensure_schema`.
-- Every statement is idempotent, so it runs on each engine start.
-- Tags are flattened into columns that mirror `fitcheck.domain.Garment`.

CREATE TABLE IF NOT EXISTS garments (
    owner         text        NOT NULL,
    id            text        NOT NULL,
    source        text        NOT NULL,
    category      text        NOT NULL,
    color_family  text        NOT NULL,
    pattern       text        NOT NULL,
    warmth        smallint    NOT NULL CHECK (warmth BETWEEN 1 AND 5),
    waterproof    boolean     NOT NULL,
    formality     smallint    NOT NULL CHECK (formality BETWEEN 1 AND 5),
    description   text        NOT NULL,
    -- Unconstrained numeric keeps the exact digits, so 19.90 comes back as 19.90
    price         numeric,
    wears         integer     NOT NULL DEFAULT 0 CHECK (wears >= 0),
    image_ref     text,
    source_url    text,
    created_at    timestamptz NOT NULL,
    -- Kept in step with the tag columns by Postgres; the search query must use the same text
    search        tsvector    GENERATED ALWAYS AS (
        to_tsvector('english', category || ' ' || color_family || ' ' || pattern || ' ' || description)
    ) STORED,
    -- Keyed per owner, so one owner's id can never overwrite another owner's garment
    PRIMARY KEY (owner, id)
);

-- Tables made before shop links were stored lack this column; a no-op once it exists
ALTER TABLE garments ADD COLUMN IF NOT EXISTS source_url text;

CREATE INDEX IF NOT EXISTS garments_owner_created_idx ON garments (owner, created_at, id);

CREATE INDEX IF NOT EXISTS garments_search_idx ON garments USING gin (search);
