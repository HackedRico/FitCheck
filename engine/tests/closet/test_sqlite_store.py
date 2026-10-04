from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from support.closet_contract import ClosetStoreContract, make_garment

from fitcheck.closet.sqlite import SqliteClosetStore, build
from fitcheck.settings import Settings

# =============================================================================
# Module Overview
# =============================================================================
# The SQLite store must behave exactly like the memory store, and unlike it,
# keep every closet across a restart and seed the demo closet only once.


class TestSqliteStore(ClosetStoreContract):
    @pytest.fixture
    def store(self, tmp_path: Path) -> Iterator[SqliteClosetStore]:
        yield SqliteClosetStore(tmp_path / "closet.db")


def test_garments_survive_a_restart(tmp_path: Path) -> None:
    garment = make_garment("g1").model_copy(update={"source_url": "https://shop.example/p/1"})
    SqliteClosetStore(tmp_path / "closet.db").save(garment)

    reopened = SqliteClosetStore(tmp_path / "closet.db")
    assert reopened.get(garment.owner, garment.id) == garment


def test_build_seeds_only_an_empty_database(tmp_path: Path) -> None:
    seed = Path(__file__).resolve().parents[3] / "demo" / "closet.json"
    settings = Settings(data_dir=tmp_path, seed_path=seed)
    first = build(settings)
    owner = first.garments("ricky")[0].owner
    first.forget(owner)
    first.save(make_garment("g2", owner="someone"))

    # A database with anything in it is the owner's; the seed must not come back
    assert build(settings).garments("ricky") == []
