from __future__ import annotations

import pytest
from support.closet_contract import ClosetStoreContract

from fitcheck.closet.memory import MemoryClosetStore
from fitcheck.ports import ClosetStore

# =============================================================================
# Module Overview
# =============================================================================
# Runs the shared `ClosetStoreContract` against `MemoryClosetStore`, the reference
# store that every durable store must match.


class TestMemoryClosetStore(ClosetStoreContract):
    @pytest.fixture
    def store(self) -> ClosetStore:
        """Yield a fresh, empty memory store."""
        return MemoryClosetStore()
