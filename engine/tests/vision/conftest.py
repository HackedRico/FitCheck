from __future__ import annotations

import io
from collections.abc import Callable

import pytest
from PIL import Image, ImageDraw

RGB = tuple[int, int, int]

# Outline of a short-sleeve tee on a 768 px square canvas, collar to hem
_TEE = [
    (250, 150),
    (330, 120),
    (384, 160),
    (438, 120),
    (518, 150),
    (640, 260),
    (570, 330),
    (520, 290),
    (520, 650),
    (248, 650),
    (248, 290),
    (198, 330),
    (128, 260),
]

# =============================================================================
# Module Overview
# =============================================================================
# Image factories for the vision tests. `cutout_png` draws a tee on a transparent
# canvas, as a cutter would return it; `garment_photo` draws a tee on a wooden
# hanger against a wall, standing in for a store photo in the live tests.


def _encode(image: Image.Image, fmt: str = "PNG") -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.fixture
def cutout_png() -> Callable[[RGB], bytes]:
    """Return a factory for a tee of one color on a transparent 768 px canvas."""

    def make(color: RGB) -> bytes:
        # Hidden pixels are black, so a tagger that ignored alpha would answer "black"
        image = Image.new("RGBA", (768, 768), (0, 0, 0, 0))
        ImageDraw.Draw(image).polygon(_TEE, fill=(*color, 255))
        return _encode(image)

    return make


@pytest.fixture
def garment_photo() -> Callable[[RGB], bytes]:
    """Return a factory for a JPEG of a tee on a wooden hanger against a beige wall."""

    def make(color: RGB) -> bytes:
        image = Image.new("RGB", (768, 900), (222, 214, 198))
        draw = ImageDraw.Draw(image)
        draw.line([(0, 40), (768, 40)], fill=(150, 150, 155), width=10)
        draw.line([(384, 40), (384, 140)], fill=(170, 170, 175), width=5)
        shifted = [(x, y + 60) for x, y in _TEE]
        draw.polygon(shifted, fill=color)
        draw.line([(255, 210), (384, 178), (513, 210)], fill=(150, 105, 60), width=12)
        draw.ellipse([(344, 170), (424, 240)], fill=tuple(int(c * 0.85) for c in color))
        return _encode(image, "JPEG")

    return make
