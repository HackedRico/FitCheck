from __future__ import annotations

import re
from collections.abc import Iterator
from contextlib import contextmanager
from importlib import resources
from typing import TYPE_CHECKING

from fitcheck.closet.rows import FIELDS, flatten, unflatten
from fitcheck.domain import AdapterInfo, Garment, RunsOn
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings

if TYPE_CHECKING:
    from psycopg import Cursor
    from psycopg.rows import DictRow

_WORD = re.compile(r"[a-z0-9]+")
# Fail fast when the container is down instead of hanging a request for a minute
_CONNECT_TIMEOUT_S = 5
# A one-letter substring matches nearly every garment, so the fallback skips those
_MIN_SUBSTRING_LEN = 2

_COLUMNS = ", ".join(FIELDS)
# Same text the generated `search` column indexes in postgres.sql
_SEARCH_TEXT = "(category || ' ' || color_family || ' ' || pattern || ' ' || description)"
# The id breaks created_at ties so every listing comes back in one stable order
_OLDEST_FIRST = "created_at, id"

_SELECT_CLOSET = f"SELECT {_COLUMNS} FROM garments WHERE owner = %s ORDER BY {_OLDEST_FIRST}"
_SELECT_ONE = f"SELECT {_COLUMNS} FROM garments WHERE owner = %s AND id = %s"
_PLACEHOLDERS = ", ".join(f"%({f})s" for f in FIELDS)
# owner and id are the key, so a replace rewrites every other column
_REPLACEMENTS = ", ".join(f"{f} = EXCLUDED.{f}" for f in FIELDS if f not in ("owner", "id"))
_UPSERT = (
    f"INSERT INTO garments ({_COLUMNS}) VALUES ({_PLACEHOLDERS}) "
    f"ON CONFLICT (owner, id) DO UPDATE SET {_REPLACEMENTS}"
)
_TEXT_SEARCH = (
    f"SELECT {_COLUMNS} FROM garments, to_tsquery('english', %(tsquery)s) AS q "
    "WHERE owner = %(owner)s AND search @@ q "
    f"ORDER BY ts_rank(search, q) DESC, {_OLDEST_FIRST} LIMIT %(limit)s"
)
_SUBSTRING_SEARCH = (
    f"SELECT {_COLUMNS} FROM garments "
    f"WHERE owner = %(owner)s AND {_SEARCH_TEXT} ILIKE ANY(%(patterns)s) "
    f"ORDER BY (SELECT count(*) FROM unnest(%(patterns)s::text[]) AS p "
    f"WHERE {_SEARCH_TEXT} ILIKE p) DESC, {_OLDEST_FIRST} LIMIT %(limit)s"
)
_DELETE_OWNER = "DELETE FROM garments WHERE owner = %s"

# =============================================================================
# Module Overview
# =============================================================================
# `PostgresClosetStore` keeps the closet in one `garments` table for the open path,
# with tags flattened into columns. `search` ranks with Postgres full-text search and
# falls back to substring matching when stemming finds nothing. `build` connects with
# `settings.database_url` and runs `ensure_schema`, which applies `sql/postgres.sql`.


class PostgresClosetStore:
    """Closet store on Postgres via psycopg 3; behaves exactly like the memory store."""

    info = AdapterInfo(name="postgres-store", license="PostgreSQL", runs_on=RunsOn.THIS_MACHINE)

    def __init__(self, conninfo: str) -> None:
        # Optional lazy import, so the core engine imports without the `postgres` extra
        try:
            import psycopg
            from psycopg.conninfo import conninfo_to_dict
        except ImportError as exc:
            raise AdapterUnavailable(
                "`psycopg` is not installed; run `make sync` to install the `postgres` extra."
            ) from exc
        try:
            params = conninfo_to_dict(conninfo)
        except psycopg.ProgrammingError as exc:
            raise AdapterUnavailable(
                f"`FITCHECK_DATABASE_URL` is not a valid Postgres URL: {exc}"
            ) from exc
        self._conninfo = conninfo
        # Host, port and database only: the URL may carry a password, which must stay out of errors
        self._target = (
            f"{params.get('host') or 'localhost'}:{params.get('port') or 5432}"
            f"/{params.get('dbname') or ''}"
        )

    def ensure_schema(self) -> None:
        """Create the `garments` table and its indexes if they are missing."""
        ddl = resources.files("fitcheck.closet").joinpath("sql/postgres.sql").read_text("utf-8")
        with self._cursor() as cur:
            cur.execute(ddl)

    def garments(self, owner: str) -> list[Garment]:
        """Return every garment `owner` has, oldest first."""
        with self._cursor() as cur:
            cur.execute(_SELECT_CLOSET, (owner,))
            return [unflatten(row) for row in cur.fetchall()]

    def get(self, owner: str, garment_id: str) -> Garment | None:
        """Return one garment, or `None` if `owner` has no garment with that id."""
        with self._cursor() as cur:
            cur.execute(_SELECT_ONE, (owner, garment_id))
            row = cur.fetchone()
        return None if row is None else unflatten(row)

    def save(self, garment: Garment) -> None:
        """Insert or replace `garment`, keyed by its owner and id."""
        with self._cursor() as cur:
            cur.execute(_UPSERT, flatten(garment))

    def search(self, owner: str, query: str, limit: int = 8) -> list[Garment]:
        """Return up to `limit` of `owner`'s garments ranked by relevance to `query`."""
        if limit < 1:
            raise InvalidInput(f"`limit` must be at least 1, got {limit}.")
        # dict.fromkeys dedupes while keeping query order, so a repeated word scores once
        words = list(dict.fromkeys(_WORD.findall(query.lower())))
        if not words:
            return []
        params: dict[str, object] = {"owner": owner, "limit": limit}
        with self._cursor() as cur:
            # Words are [a-z0-9]+ only, so joining them cannot inject tsquery operators
            cur.execute(_TEXT_SEARCH, params | {"tsquery": " | ".join(words)})
            rows = cur.fetchall()
            # Stemming and stop words drop short or partial words like "over" or "jack"
            patterns = [f"%{w}%" for w in words if len(w) >= _MIN_SUBSTRING_LEN]
            if not rows and patterns:
                cur.execute(_SUBSTRING_SEARCH, params | {"patterns": patterns})
                rows = cur.fetchall()
        return [unflatten(row) for row in rows]

    def forget(self, owner: str) -> int:
        """Delete everything stored for `owner` and return how many garments went."""
        with self._cursor() as cur:
            cur.execute(_DELETE_OWNER, (owner,))
            return int(cur.rowcount)

    @contextmanager
    def _cursor(self) -> Iterator[Cursor[DictRow]]:
        """Yield a cursor on a fresh connection that commits on success and always closes."""
        import psycopg
        from psycopg.rows import dict_row

        # A connection per operation keeps the store safe on FastAPI's thread pool with no lock
        try:
            with (
                psycopg.connect(
                    self._conninfo, connect_timeout=_CONNECT_TIMEOUT_S, row_factory=dict_row
                ) as conn,
                conn.cursor() as cur,
            ):
                yield cur
        except psycopg.OperationalError as exc:
            reason = str(exc).splitlines()[0] if str(exc) else type(exc).__name__
            raise AdapterUnavailable(
                f"Postgres at `{self._target}` is unavailable ({reason}); "
                "start it with `make db-up` or fix `FITCHECK_DATABASE_URL`."
            ) from exc
        except psycopg.errors.UndefinedTable as exc:
            raise AdapterUnavailable(
                "Table `garments` is missing, likely after a database reset; "
                "restart the engine so `ensure_schema` recreates it."
            ) from exc


def build(settings: Settings) -> PostgresClosetStore:
    """Return a store on `settings.database_url` with the `garments` table in place."""
    store = PostgresClosetStore(settings.database_url)
    store.ensure_schema()
    return store
