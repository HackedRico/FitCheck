from __future__ import annotations

import json
import logging
import re
from collections.abc import Sequence
from typing import Any

from fitcheck.closet.rows import FIELDS, flatten, unflatten, utc
from fitcheck.domain import AdapterInfo, Garment, RunsOn
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings
from fitcheck.snowflake_session import SnowflakeQueryFailed, SnowflakeSession, session_for

log = logging.getLogger(__name__)

_WORD = re.compile(r"[a-z0-9]+")
# A one-letter substring matches nearly every garment, so the keyword match skips those
_MIN_SUBSTRING_LEN = 2
# Bounds the generated SQL; words past this in a long chat message add noise, not recall
_MAX_QUERY_WORDS = 16
# A closet holds a few hundred garments at most; the cap bounds a query that matches everything
_CANDIDATE_CAP = 200

# Snowflake folds unquoted names to upper case; OWNER and ID lead, as in `FIELDS`
_FIELDS = tuple(f.upper() for f in FIELDS)
_COLUMNS = ", ".join(_FIELDS)
# Same text the CLOSET_SEARCH service indexes in engine/sql/snowflake/setup.sql
_SEARCH_TEXT = "CONCAT_WS(' ', CATEGORY, COLOR_FAMILY, PATTERN, DESCRIPTION)"
# The id breaks created_at ties so every listing comes back in one stable order
_OLDEST_FIRST = "CREATED_AT, ID"
# Python writes microseconds and a `+HH:MM` offset; spelling the format out avoids AUTO guessing
_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.FF6TZH:TZM'

_SELECT_CLOSET = f"SELECT {_COLUMNS} FROM GARMENTS WHERE OWNER = %(owner)s ORDER BY {_OLDEST_FIRST}"
_SELECT_ONE = f"SELECT {_COLUMNS} FROM GARMENTS WHERE OWNER = %(owner)s AND ID = %(id)s"
_DELETE_OWNER = "DELETE FROM GARMENTS WHERE OWNER = %(owner)s"
_MERGE = (
    "MERGE INTO GARMENTS AS t USING (SELECT "
    "%(owner)s AS OWNER, %(id)s AS ID, %(source)s AS SOURCE, %(category)s AS CATEGORY, "
    "%(color_family)s AS COLOR_FAMILY, %(pattern)s AS PATTERN, %(warmth)s AS WARMTH, "
    "%(waterproof)s AS WATERPROOF, %(formality)s AS FORMALITY, "
    "%(description)s AS DESCRIPTION, %(price)s::NUMBER(10, 2) AS PRICE, %(wears)s AS WEARS, "
    "%(image_ref)s AS IMAGE_REF, %(source_url)s AS SOURCE_URL, "
    f"TO_TIMESTAMP_TZ(%(created_at)s, '{_TIMESTAMP_FORMAT}') AS CREATED_AT) AS s "
    "ON t.OWNER = s.OWNER AND t.ID = s.ID "
    "WHEN MATCHED THEN UPDATE SET "
    + ", ".join(f"{f} = s.{f}" for f in _FIELDS[2:])
    + f" WHEN NOT MATCHED THEN INSERT ({_COLUMNS}) VALUES ("
    + ", ".join(f"s.{f}" for f in _FIELDS)
    + ")"
)
_CORTEX_SEARCH = "SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(%(service)s, %(request)s)"

# =============================================================================
# Module Overview
# =============================================================================
# `SnowflakeClosetStore` keeps the closet in one GARMENTS table with tags flattened
# into columns. `search` lets the CLOSET_SEARCH Cortex Search service rank garments
# and the table decide which ones match, so a lagging index never hides a new garment
# or shows a deleted one; when the service fails it logs and ranks by keyword overlap.


class SnowflakeClosetStore:
    """Closet store on a Snowflake table, ranked by Cortex Search; matches the memory store."""

    info = AdapterInfo(
        name="snowflake-store",
        model="Cortex Search",
        license="Proprietary",
        runs_on=RunsOn.SNOWFLAKE,
    )

    def __init__(self, session: SnowflakeSession, search_service: str) -> None:
        self._session = session
        self._service = search_service

    def garments(self, owner: str) -> list[Garment]:
        """Return every garment `owner` has, oldest first."""
        with self._session.cursor() as cur:
            cur.execute(_SELECT_CLOSET, {"owner": owner})
            return [_to_garment(row) for row in cur.fetchall()]

    def get(self, owner: str, garment_id: str) -> Garment | None:
        """Return one garment, or `None` if `owner` has no garment with that id."""
        with self._session.cursor() as cur:
            cur.execute(_SELECT_ONE, {"owner": owner, "id": garment_id})
            row = cur.fetchone()
        return None if row is None else _to_garment(row)

    def save(self, garment: Garment) -> None:
        """Insert or replace `garment`, keyed by its owner and id."""
        with self._session.cursor() as cur:
            cur.execute(_MERGE, _to_params(garment))

    def search(self, owner: str, query: str, limit: int = 8) -> list[Garment]:
        """Return up to `limit` of `owner`'s garments that share a word with `query`, best first."""
        if limit < 1:
            raise InvalidInput(f"`limit` must be at least 1, got {limit}.")
        words = _query_words(query)
        if not words:
            return []
        matches = self._keyword_matches(owner, words)
        if not matches:
            return []
        ranks = self._cortex_ranks(owner, query, max(limit, len(matches)))
        if ranks is None:
            return matches[:limit]
        # Stable sort: the index's order first, then garments it has not refreshed yet by overlap
        return sorted(matches, key=lambda g: ranks.get(g.id, len(ranks)))[:limit]

    def forget(self, owner: str) -> int:
        """Delete everything stored for `owner` and return how many garments went."""
        with self._session.cursor() as cur:
            cur.execute(_DELETE_OWNER, {"owner": owner})
            return max(cur.rowcount or 0, 0)

    # -----------------------------------------------------------------
    # Search helpers
    # -----------------------------------------------------------------

    def _keyword_matches(self, owner: str, words: list[str]) -> list[Garment]:
        """Return `owner`'s garments containing any of `words`, most words matched first."""
        names = [f"w{i}" for i in range(len(words))]
        hits = " + ".join(f"IFF({_SEARCH_TEXT} ILIKE %({n})s, 1, 0)" for n in names)
        sql = (
            f"SELECT {_COLUMNS} FROM (SELECT {_COLUMNS}, {hits} AS HITS FROM GARMENTS "
            "WHERE OWNER = %(owner)s) WHERE HITS > 0 "
            f"ORDER BY HITS DESC, {_OLDEST_FIRST} LIMIT %(cap)s"
        )
        params: dict[str, object] = {"owner": owner, "cap": _CANDIDATE_CAP}
        # Words are [a-z0-9]+ only, so a pattern can carry no `%` or `_` wildcard of its own
        params |= {n: f"%{w}%" for n, w in zip(names, words, strict=True)}
        with self._session.cursor() as cur:
            cur.execute(sql, params)
            return [_to_garment(row) for row in cur.fetchall()]

    def _cortex_ranks(self, owner: str, query: str, limit: int) -> dict[str, int] | None:
        """Return garment id to rank from Cortex Search, or `None` after logging why it failed."""
        request = json.dumps(
            {
                "query": query,
                "columns": ["ID"],
                "filter": {"@eq": {"OWNER": owner}},
                "limit": limit,
            }
        )
        try:
            with self._session.cursor() as cur:
                cur.execute(_CORTEX_SEARCH, {"service": self._service, "request": request})
                ids = _result_ids(cur.fetchone())
        # Search ranking is a nicety; keyword overlap still answers, so the chat keeps working
        except (SnowflakeQueryFailed, ValueError) as exc:
            log.warning(
                "[SnowflakeClosetStore] Cortex Search `%s` failed; ranking by keyword overlap "
                "instead. Reason: %s",
                self._service,
                exc,
            )
            return None
        ranks: dict[str, int] = {}
        for gid in ids:
            # The index may list a garment twice mid-refresh; its best rank counts
            ranks.setdefault(gid, len(ranks))
        return ranks


# =============================================================================
# Row mapping
# =============================================================================


def _query_words(query: str) -> list[str]:
    """Return the distinct searchable words of `query`, in order, at most `_MAX_QUERY_WORDS`."""
    # dict.fromkeys dedupes while keeping query order, so a repeated word scores once
    words = dict.fromkeys(w for w in _WORD.findall(query.lower()) if len(w) >= _MIN_SUBSTRING_LEN)
    return list(words)[:_MAX_QUERY_WORDS]


def _result_ids(row: Sequence[Any] | None) -> list[str]:
    """Return the ranked `ID`s in a SEARCH_PREVIEW answer; raise `ValueError` on another shape."""
    if row is None or not row:
        raise ValueError("SEARCH_PREVIEW returned no row")
    payload = json.loads(row[0]) if isinstance(row[0], str) else row[0]
    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        raise ValueError("SEARCH_PREVIEW answer has no `results` list")
    ids: list[str] = []
    for hit in results:
        # Unquoted DDL makes the column `ID`, but accept any case the service echoes back
        value = next((v for k, v in hit.items() if k.upper() == "ID"), None)
        if value is not None:
            ids.append(str(value))
    return ids


def _to_params(garment: Garment) -> dict[str, object]:
    """Flatten `garment` and its tags into the named parameters of `_MERGE`."""
    return flatten(garment) | {
        # As text, so the exact decimal reaches NUMBER(10, 2) without a float in between
        "price": None if garment.price is None else str(garment.price),
        "created_at": utc(garment.created_at).isoformat(timespec="microseconds"),
    }


def _to_garment(row: Sequence[Any]) -> Garment:
    """Rebuild a `Garment` from one row in `_FIELDS` order."""
    return unflatten(dict(zip(FIELDS, row, strict=True)))


def build(settings: Settings) -> SnowflakeClosetStore:
    """Return a store on the GARMENTS table that `engine/sql/snowflake/setup.sql` creates."""
    session = session_for(settings)
    service = session.qualify(settings.cortex_search_service, "FITCHECK_CORTEX_SEARCH_SERVICE")
    return SnowflakeClosetStore(session, service)
