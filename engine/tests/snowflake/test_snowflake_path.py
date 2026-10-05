from __future__ import annotations

import json
import logging
from collections.abc import Iterator, Mapping, Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from support.closet_contract import ClosetStoreContract, Owners, make_garment, unique_owners

from fitcheck.closet import snowflake as closet_snowflake
from fitcheck.closet.snowflake import SnowflakeClosetStore
from fitcheck.domain import ChatTurn, ColorFamily, RunsOn, StylistBrief
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings
from fitcheck.snowflake_session import (
    Connection,
    Cursor,
    SnowflakeSession,
    cortex_model_license,
    session_for,
    sql_object_constant,
)
from fitcheck.stylist import cortex as stylist_cortex
from fitcheck.stylist.cortex import CortexStylist

errors = pytest.importorskip("snowflake.connector.errors")

_SERVICE = "FITCHECK.PUBLIC.CLOSET_SEARCH"
_SNEAKY = "o'brien'; DROP TABLE GARMENTS; --"

# =============================================================================
# Module Overview
# =============================================================================
# Tests the Snowflake path without an account: a `FakeConnection` records every
# statement and answers from canned rows, so the tests check that values travel as
# bind parameters, that search falls back when Cortex Search fails, and that missing
# settings raise `AdapterUnavailable`. `TestSnowflakeClosetStoreLive` needs a real account
# and writes only under `test-<uuid>-` owners, so it never touches the demo closet.


class FakeCursor:
    """Records statements and answers each from the first matching canned reply."""

    def __init__(self, conn: FakeConnection) -> None:
        self._conn = conn
        self._rows: list[tuple[Any, ...]] = []
        self.rowcount: int | None = None

    def execute(self, command: str, params: Mapping[str, Any] | None = None) -> object:
        self._conn.calls.append((command, dict(params or {})))
        for needle, reply in self._conn.replies.items():
            if needle in command:
                if isinstance(reply, Exception):
                    raise reply
                self._rows = list(reply)
                self.rowcount = len(self._rows)
                return self
        self._rows = []
        self.rowcount = self._conn.rowcount
        return self

    def fetchone(self) -> Sequence[Any] | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> Sequence[Sequence[Any]]:
        return self._rows

    def close(self) -> object:
        return None


class FakeConnection:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.replies: dict[str, Exception | list[tuple[Any, ...]]] = {}
        self.rowcount: int | None = None

    def cursor(self) -> Cursor:
        return FakeCursor(self)

    def is_closed(self) -> bool:
        return False


def _settings(**overrides: Any) -> Settings:
    """Return settings isolated from `engine/.env` and the shell, with Snowflake creds set."""
    values: dict[str, Any] = {
        "snowflake_account": "xy12345",
        "snowflake_user": "fitcheck",
        "snowflake_password": "pw",
        "snowflake_private_key_path": None,
        "snowflake_role": None,
    }
    return Settings(_env_file=None, **(values | overrides))  # type: ignore[call-arg]


@pytest.fixture
def conn() -> FakeConnection:
    return FakeConnection()


@pytest.fixture
def session(conn: FakeConnection) -> SnowflakeSession:
    fake: Connection = conn
    return SnowflakeSession(_settings(), connect=lambda: fake)


def _row(garment_id: str, owner: str = "maya", **fields: Any) -> tuple[Any, ...]:
    """Return a GARMENTS row in the store's column order."""
    g = make_garment(garment_id, owner, **fields)
    t = g.tags
    return (
        g.owner, g.id, g.source.value, t.category.value, t.color_family.value,
        t.pattern.value, t.warmth, t.waterproof, t.formality, t.description,
        g.price, g.wears, g.image_ref, g.source_url, g.created_at,
    )  # fmt: skip


# =============================================================================
# Settings and session
# =============================================================================


@pytest.mark.parametrize("module", [closet_snowflake, stylist_cortex])
def test_missing_settings_name_the_env_vars(module: Any) -> None:
    settings = _settings(snowflake_account=None, snowflake_password=None)
    with pytest.raises(AdapterUnavailable) as caught:
        module.build(settings)
    assert "FITCHECK_SNOWFLAKE_ACCOUNT" in str(caught.value)
    assert "FITCHECK_SNOWFLAKE_PASSWORD" in str(caught.value)


def test_a_missing_key_file_is_reported(tmp_path: Any) -> None:
    with pytest.raises(AdapterUnavailable, match="not a file"):
        SnowflakeSession(_settings(snowflake_private_key_path=tmp_path / "nope.p8"))


def test_a_non_identifier_schema_is_refused() -> None:
    with pytest.raises(AdapterUnavailable, match="FITCHECK_SNOWFLAKE_SCHEMA"):
        SnowflakeSession(_settings(snowflake_schema="PUBLIC; DROP"))


def test_session_is_shared_per_account() -> None:
    assert session_for(_settings()) is session_for(_settings())


def test_connector_errors_become_adapter_unavailable(
    conn: FakeConnection, session: SnowflakeSession
) -> None:
    conn.replies["FROM GARMENTS"] = errors.ProgrammingError("Table 'GARMENTS' does not exist")
    store = SnowflakeClosetStore(session, _SERVICE)
    with pytest.raises(AdapterUnavailable, match="does not exist"):
        store.garments("maya")


def test_object_constant_escapes_quotes_and_percent() -> None:
    rendered = sql_object_constant({"a": ["it's", 50, True, None], "b": "5%"})
    assert rendered == "{'a': ['it\\'s', 50, TRUE, NULL], 'b': '5%%'}"


def test_licenses_follow_the_model_family() -> None:
    assert cortex_model_license("llama4-maverick") == "Llama 4 Community License"
    assert cortex_model_license("llama3.3-70b") == "Llama 3.3 Community License"
    assert cortex_model_license("mystery-model") is None


# =============================================================================
# Closet store
# =============================================================================


def test_every_value_travels_as_a_bind_parameter(
    conn: FakeConnection, session: SnowflakeSession
) -> None:
    store = SnowflakeClosetStore(session, _SERVICE)
    store.save(make_garment("tee", _SNEAKY, description=_SNEAKY, price=Decimal("19.99")))
    store.garments(_SNEAKY)
    store.get(_SNEAKY, _SNEAKY)
    store.search(_SNEAKY, f"navy {_SNEAKY}")
    store.forget(_SNEAKY)

    for sql, params in conn.calls:
        assert "o'brien" not in sql and "brien" not in sql
        assert "DROP" not in sql
        assert params, sql
    merge_params = conn.calls[0][1]
    assert merge_params["price"] == "19.99"
    assert merge_params["created_at"].endswith("+00:00")


def test_search_ranks_by_cortex_and_keeps_only_keyword_matches(
    conn: FakeConnection, session: SnowflakeSession
) -> None:
    conn.replies["HITS"] = [_row("coat"), _row("breton")]
    answer = {"results": [{"ID": "breton"}, {"ID": "ghost"}, {"ID": "coat"}]}
    conn.replies["SEARCH_PREVIEW"] = [(json.dumps(answer),)]
    store = SnowflakeClosetStore(session, _SERVICE)

    found = store.search("maya", "navy wool")

    assert [g.id for g in found] == ["breton", "coat"]
    _sql, params = conn.calls[-1]
    request = json.loads(params["request"])
    assert request["filter"] == {"@eq": {"OWNER": "maya"}}
    assert params["service"] == _SERVICE


def test_search_falls_back_to_keywords_when_cortex_search_fails(
    conn: FakeConnection, session: SnowflakeSession, caplog: pytest.LogCaptureFixture
) -> None:
    conn.replies["HITS"] = [_row("coat"), _row("breton")]
    conn.replies["SEARCH_PREVIEW"] = errors.ProgrammingError("Cortex Search Service does not exist")
    store = SnowflakeClosetStore(session, _SERVICE)

    with caplog.at_level(logging.WARNING):
        found = store.search("maya", "navy wool", limit=1)

    assert [g.id for g in found] == ["coat"]
    assert "falling back" in caplog.text or "keyword overlap" in caplog.text


def test_search_skips_snowflake_for_an_empty_query(
    conn: FakeConnection, session: SnowflakeSession
) -> None:
    store = SnowflakeClosetStore(session, _SERVICE)
    assert store.search("maya", "  ?! ") == []
    assert conn.calls == []
    with pytest.raises(InvalidInput):
        store.search("maya", "navy", limit=0)


def test_rows_map_back_to_garments(conn: FakeConnection, session: SnowflakeSession) -> None:
    created = datetime(2026, 3, 14, 15, 9, 26, 535897, tzinfo=UTC)
    conn.replies["ID = %(id)s"] = [_row("tee", color=ColorFamily.NAVY, created_at=created)]
    store = SnowflakeClosetStore(session, _SERVICE)

    got = store.get("maya", "tee")

    assert got is not None
    assert got.tags.color_family is ColorFamily.NAVY
    assert got.created_at == created
    assert store.info.runs_on is RunsOn.SNOWFLAKE


def test_forget_returns_the_deleted_count(conn: FakeConnection, session: SnowflakeSession) -> None:
    conn.rowcount = 3
    assert SnowflakeClosetStore(session, _SERVICE).forget("maya") == 3


# =============================================================================
# Stylist
# =============================================================================


def test_stylist_sends_one_bound_prompt_with_structured_output(
    conn: FakeConnection, session: SnowflakeSession
) -> None:
    conn.replies["AI_COMPLETE"] = [('{"text": "BUY it.", "render_garment_ids": ["coat"]}',)]
    stylist = CortexStylist(session, "llama3.3-70b")
    history = [ChatTurn(role="user", text="hi"), ChatTurn(role="stylist", text="hello")]

    reply = stylist.reply(StylistBrief(), history, f"what about {_SNEAKY}?")

    assert reply.text == "BUY it."
    assert reply.render is not None and reply.render.garment_ids == ("coat",)
    sql, params = conn.calls[0]
    assert "response_format => {'type': 'json'" in sql
    assert "brien" not in sql
    assert params["model"] == "llama3.3-70b"
    assert params["prompt"].endswith(f"User: what about {_SNEAKY}?")
    assert "Stylist: hello" in params["prompt"]


def test_stylist_reports_an_empty_completion(
    conn: FakeConnection, session: SnowflakeSession
) -> None:
    conn.replies["AI_COMPLETE"] = [(None,)]
    with pytest.raises(AdapterUnavailable, match="FITCHECK_CORTEX_MODEL"):
        CortexStylist(session, "llama3.3-70b").reply(StylistBrief(), [], "hi")


# =============================================================================
# Live: the closet contract against a real account (FITCHECK_LIVE=1)
# =============================================================================


@pytest.mark.live
class TestSnowflakeClosetStoreLive(ClosetStoreContract):
    @pytest.fixture
    def owners(self) -> Owners:
        """Return owners unique to this test, since the account also holds the demo closet."""
        return unique_owners()

    @pytest.fixture
    def store(self, owners: Owners) -> Iterator[SnowflakeClosetStore]:
        """Yield the configured store and forget this test's owners afterwards."""
        settings = Settings()
        # Teardown deletes by owner, so a plain name here would wipe the seeded demo closet
        assert settings.default_owner not in owners
        store = closet_snowflake.build(settings)
        yield store
        for owner in owners:
            store.forget(owner)
