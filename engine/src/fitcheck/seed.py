from __future__ import annotations

import json
from pathlib import Path

from pydantic import TypeAdapter

from fitcheck.domain import Garment

_GARMENTS = TypeAdapter(list[Garment])

# =============================================================================
# Module Overview
# =============================================================================
# Loads the demo closet from `demo/closet.json`. The file is `{"garments": [...]}`
# where each entry is a `Garment` in JSON form; images it references use the
# `seed/` prefix and live in `demo/images/`.


def load_seed(path: Path) -> list[Garment]:
    """Return the garments in the seed file at `path`; an absent file means no seed."""
    if not path.is_file():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or "garments" not in raw:
        raise ValueError(f"Seed file {path} must be an object with a `garments` list.")
    return _GARMENTS.validate_python(raw["garments"])
