from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path

from fitcheck.closet.memory import rank_by_words
from fitcheck.domain import AdapterInfo, Garment, RunsOn
from fitcheck.errors import AdapterUnavailable
from fitcheck.seed import load_seed
from fitcheck.settings import Settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS garments (
    owner TEXT NOT NULL,
    id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    doc TEXT NOT NULL,
    PRIMARY KEY (owner, id)
)
"""

# =============================================================================
# Module Overview
# =============================================================================
# `SqliteClosetStore` keeps every closet in one SQLite file next to the stored
# garment images, so what people add survives a restart with no database server.
# Each garment is stored whole as JSON; closets are small, so search ranks in
# Python the same way the memory store does. The demo closet is seeded only into
# an empty database.


class SqliteClosetStore:
    """A durable closet store in a single SQLite file; the default for local runs."""

    info = AdapterInfo(name="sqlite-store", license="Public domain", runs_on=RunsOn.THIS_MACHINE)

    def __init__(self, path: Path) -> None:
        self._path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute(_SCHEMA)

    def garments(self, owner: str) -> list[Garment]:
        """Return every garment `owner` has, oldest first."""
        with self._connect() as db:
            rows = db.execute(
                "SELECT doc FROM garments WHERE owner = ? ORDER BY created_at, id", (owner,)
            ).fetchall()
        return [Garment.model_validate_json(doc) for (doc,) in rows]

    def get(self, owner: str, garment_id: str) -> Garment | None:
        """Return one garment, or `None`."""
        with self._connect() as db:
            row = db.execute(
                "SELECT doc FROM garments WHERE owner = ? AND id = ?", (owner, garment_id)
            ).fetchone()
        return Garment.model_validate_json(row[0]) if row else None

    def save(self, garment: Garment) -> None:
        """Insert or replace `garment`."""
        with self._connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO garments (owner, id, created_at, doc) VALUES (?, ?, ?, ?)",
                (
                    garment.owner,
                    garment.id,
                    garment.created_at.isoformat(),
                    garment.model_dump_json(),
                ),
            )

    def search(self, owner: str, query: str, limit: int = 8) -> list[Garment]:
        """Rank `owner`'s garments by how many query words appear in their tags."""
        return rank_by_words(self.garments(owner), query, limit)

    def forget(self, owner: str) -> int:
        """Delete everything for `owner`; return the number of garments removed."""
        with self._connect() as db:
            return db.execute("DELETE FROM garments WHERE owner = ?", (owner,)).rowcount

    def is_empty(self) -> bool:
        """Report whether no owner has any garment, which is when the demo closet is seeded."""
        with self._connect() as db:
            return db.execute("SELECT 1 FROM garments LIMIT 1").fetchone() is None

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        """Open a connection per operation, so FastAPI's worker threads never share one."""
        try:
            connection = sqlite3.connect(self._path, timeout=10)
        except sqlite3.Error as exc:
            raise AdapterUnavailable(
                f"Could not open the closet database at {self._path}: {exc}"
            ) from exc
        with closing(connection), connection:
            yield connection


def build(settings: Settings) -> SqliteClosetStore:
    """Return the store at `<data_dir>/closet.db`, seeding the demo closet into a new file."""
    store = SqliteClosetStore(settings.data_dir / "closet.db")
    if settings.seed_path and store.is_empty():
        for garment in load_seed(settings.seed_path):
            store.save(garment)
    return store
