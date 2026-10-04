from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from fitcheck.domain import Garment, GarmentTags, Verdict, WeekContext

# =============================================================================
# Module Overview
# =============================================================================
# The verdict rules: plain, deterministic code decides BUY, SKIP or TRY_WITH so the
# demo repeats exactly, and the stylist model only explains the result. `decide` is
# the whole interface; it is pure, with no I/O and no clock of its own.


def decide(
    candidate: GarmentTags, closet: Sequence[Garment], week: WeekContext, today: date
) -> Verdict:
    """Return the verdict for buying `candidate` given `closet` and the coming `week`."""
    raise NotImplementedError("verdict rules are being built; see docs/verdict-rules.md")
