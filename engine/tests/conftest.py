from __future__ import annotations

import io
import os
from pathlib import Path

import pytest
from PIL import Image

from fitcheck.settings import Settings

# Shared test helpers live outside test modules; rewrite their asserts into readable failures
pytest.register_assert_rewrite("support")

# =============================================================================
# Module Overview
# =============================================================================
# Shared pytest setup. Tests marked `live` talk to real services and run only with
# `FITCHECK_LIVE=1`; `png_bytes` gives any test a small valid image to send, and
# `offline_settings` an engine configuration that needs no service.


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip `live` tests unless `FITCHECK_LIVE=1`."""
    if os.environ.get("FITCHECK_LIVE") == "1":
        return
    skip = pytest.mark.skip(reason="live test; set FITCHECK_LIVE=1 to run")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def offline_settings(tmp_path: Path) -> Settings:
    """Return settings for an engine on fakes and an empty memory store, ignoring `engine/.env`."""
    return Settings(_env_file=None, store="memory", data_dir=tmp_path, seed_path=None)  # type: ignore[call-arg]


@pytest.fixture
def png_bytes() -> bytes:
    """Return a 64x96 PNG with a yellow block, standing in for a garment photo."""
    image = Image.new("RGB", (64, 96), "white")
    image.paste((240, 200, 30), (16, 16, 48, 80))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
