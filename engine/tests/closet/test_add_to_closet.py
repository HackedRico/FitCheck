from __future__ import annotations

from decimal import Decimal

import pytest

from fitcheck.engine import Engine
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings
from fitcheck.wiring import build_engine

# =============================================================================
# Module Overview
# =============================================================================
# `Engine.add_to_closet` stores what the caller sends, so it refuses values the web
# app would show back unsafely, such as a `javascript:` shop link, or that a database
# column cannot hold, such as a negative or NaN price.


@pytest.fixture
def engine(offline_settings: Settings) -> Engine:
    return build_engine(offline_settings)


def test_a_shop_link_is_kept(engine: Engine, png_bytes: bytes) -> None:
    result = engine.add_to_closet("maya", png_bytes, source_url="https://shop.example/p/1")
    assert engine.closet("maya")[0].source_url == "https://shop.example/p/1"
    assert result.garment.source_url == "https://shop.example/p/1"


@pytest.mark.parametrize(
    "url", ["javascript:alert(1)", "data:text/html,hi", "shop.example/p/1", "https://" + "a" * 2050]
)
def test_a_shop_link_must_be_a_web_address(engine: Engine, png_bytes: bytes, url: str) -> None:
    with pytest.raises(InvalidInput, match="source_url"):
        engine.add_to_closet("maya", png_bytes, source_url=url)
    assert engine.closet("maya") == []


@pytest.mark.parametrize("price", [Decimal("-1"), Decimal("NaN"), Decimal("Infinity")])
def test_a_price_must_be_a_finite_amount(engine: Engine, png_bytes: bytes, price: Decimal) -> None:
    with pytest.raises(InvalidInput, match="price"):
        engine.add_to_closet("maya", png_bytes, price=price)
