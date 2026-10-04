from __future__ import annotations

from collections.abc import Iterator

import pytest
from support.closet_contract import ClosetStoreContract, make_garment

from fitcheck.closet.postgres import PostgresClosetStore, build
from fitcheck.domain import Category, ColorFamily, RunsOn
from fitcheck.errors import AdapterUnavailable
from fitcheck.settings import Settings

psycopg = pytest.importorskip("psycopg")

# Nothing listens on port 1, so the connection is refused at once
_DOWN_URL = "postgresql://fitcheck:s3cret@127.0.0.1:1/fitcheck"
_TEST_SCHEMA = "fitcheck_test"

# =============================================================================
# Module Overview
# =============================================================================
# Runs `ClosetStoreContract` against `PostgresClosetStore` in a throwaway schema, so
# the live tests never touch the real closet, and checks Postgres-only behaviour:
# the substring fallback in `search` and the errors raised when the database is down.


@pytest.fixture(scope="module")
def test_conninfo() -> Iterator[str]:
    """Yield a conninfo whose tables live in a schema dropped after the module runs."""
    from psycopg.conninfo import make_conninfo

    url = Settings().database_url
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(f"CREATE SCHEMA IF NOT EXISTS {_TEST_SCHEMA}")
    yield make_conninfo(url, options=f"-c search_path={_TEST_SCHEMA}")
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {_TEST_SCHEMA} CASCADE")


# =============================================================================
# Live: the contract and search details against a running Postgres
# =============================================================================


@pytest.mark.live
class TestPostgresClosetStore(ClosetStoreContract):
    @pytest.fixture
    def store(self, test_conninfo: str) -> PostgresClosetStore:
        """Return a store on an empty `garments` table in the test schema."""
        store = PostgresClosetStore(test_conninfo)
        store.ensure_schema()
        with psycopg.connect(test_conninfo) as conn:
            conn.execute("TRUNCATE garments")
        return store

    def test_ensure_schema_runs_twice(self, store: PostgresClosetStore) -> None:
        store.save(make_garment("tee"))

        store.ensure_schema()

        assert [g.id for g in store.garments("maya")] == ["tee"]

    def test_search_matches_other_forms_of_a_word(self, store: PostgresClosetStore) -> None:
        store.save(make_garment("mac", category=Category.OUTERWEAR, description="rain jacket"))

        assert [g.id for g in store.search("maya", "jackets for raining")] == ["mac"]

    def test_search_falls_back_to_substrings(self, store: PostgresClosetStore) -> None:
        store.save(
            make_garment(
                "coat",
                category=Category.OUTERWEAR,
                color=ColorFamily.NAVY,
                description="wool overcoat",
            )
        )
        store.save(make_garment("tee", minute=1))

        # "over" is an English stop word and "overc" a partial word; full-text search finds neither
        assert [g.id for g in store.search("maya", "over")] == ["coat"]
        assert [g.id for g in store.search("maya", "overc")] == ["coat"]
        assert store.search("maya", "o") == []

    def test_build_returns_a_ready_store(self, test_conninfo: str) -> None:
        store = build(Settings(database_url=test_conninfo))

        store.save(make_garment("tee"))

        assert store.get("maya", "tee") is not None


# =============================================================================
# Offline: adapter info and failures, no database needed
# =============================================================================


def test_info_reports_a_local_postgres() -> None:
    info = PostgresClosetStore(_DOWN_URL).info

    assert (info.name, info.license, info.runs_on) == (
        "postgres-store",
        "PostgreSQL",
        RunsOn.THIS_MACHINE,
    )


def test_unreachable_database_names_the_fix() -> None:
    store = PostgresClosetStore(_DOWN_URL)

    with pytest.raises(AdapterUnavailable, match="make db-up") as caught:
        store.garments("maya")

    assert "127.0.0.1:1/fitcheck" in str(caught.value)
    assert "s3cret" not in str(caught.value)


def test_build_fails_fast_when_the_database_is_down() -> None:
    with pytest.raises(AdapterUnavailable, match="make db-up"):
        build(Settings(database_url=_DOWN_URL))


def test_malformed_url_is_reported_as_misconfiguration() -> None:
    with pytest.raises(AdapterUnavailable, match="FITCHECK_DATABASE_URL"):
        PostgresClosetStore("not a url")
