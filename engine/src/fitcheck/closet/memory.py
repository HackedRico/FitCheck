from __future__ import annotations

import re
from threading import Lock

from fitcheck.domain import AdapterInfo, Garment, RunsOn
from fitcheck.errors import InvalidInput
from fitcheck.seed import load_seed
from fitcheck.settings import Settings

_WORD = re.compile(r"[a-z0-9]+")

# =============================================================================
# Module Overview
# =============================================================================
# `MemoryClosetStore` keeps garments in a dict for tests and offline demos; data is
# gone when the process stops. `build` loads the demo closet from the seed file so a
# fresh server already has Ricky's closet.


class MemoryClosetStore:
    """In-process closet store; the reference behaviour every other store must match."""

    info = AdapterInfo(name="memory-store", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

    def __init__(self, garments: list[Garment] | None = None) -> None:
        # owner -> garment id -> garment
        self._by_owner: dict[str, dict[str, Garment]] = {}
        # FastAPI runs sync routes on a thread pool, so writes can race
        self._lock = Lock()
        for garment in garments or []:
            self.save(garment)

    def garments(self, owner: str) -> list[Garment]:
        """Return every garment `owner` has, oldest first."""
        # Order by `created_at` like a database would; the id breaks ties so order is stable
        return sorted(self._by_owner.get(owner, {}).values(), key=lambda g: (g.created_at, g.id))

    def get(self, owner: str, garment_id: str) -> Garment | None:
        """Return one garment, or `None`."""
        return self._by_owner.get(owner, {}).get(garment_id)

    def save(self, garment: Garment) -> None:
        """Insert or replace `garment`."""
        with self._lock:
            self._by_owner.setdefault(garment.owner, {})[garment.id] = garment

    def search(self, owner: str, query: str, limit: int = 8) -> list[Garment]:
        """Rank `owner`'s garments by how many query words appear in their tags."""
        return rank_by_words(self.garments(owner), query, limit)

    def forget(self, owner: str) -> int:
        """Delete everything for `owner`; return the number of garments removed."""
        with self._lock:
            return len(self._by_owner.pop(owner, {}))


def rank_by_words(garments: list[Garment], query: str, limit: int) -> list[Garment]:
    """Rank `garments` by how many query words appear in their tags; shared by local stores."""
    if limit < 1:
        raise InvalidInput(f"`limit` must be at least 1, got {limit}.")
    words = set(_WORD.findall(query.lower()))
    scored = [(_overlap(words, g), g) for g in garments]
    # Stable sort keeps closet order among ties, so results repeat run to run
    ranked = sorted((pair for pair in scored if pair[0] > 0), key=lambda p: -p[0])
    return [g for _, g in ranked[:limit]]


def _overlap(words: set[str], garment: Garment) -> int:
    t = garment.tags
    text = f"{t.category} {t.color_family} {t.pattern} {t.description}".lower()
    return len(words & set(_WORD.findall(text)))


def build(settings: Settings) -> MemoryClosetStore:
    """Return a memory store pre-loaded with the seed closet, if one is configured."""
    seed = load_seed(settings.seed_path) if settings.seed_path else []
    return MemoryClosetStore(seed)
