from __future__ import annotations

import io

import pytest
from PIL import Image

from fitcheck.domain import RunsOn, TryOnRegion, TryOnRequest
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings
from fitcheck.tryon.overlay import OverlayRenderer, build

# =============================================================================
# Module Overview
# =============================================================================
# Tests for `OverlayRenderer`: the output is a PNG the size of the person photo, the
# garment lands in the region's box, and unreadable input raises `InvalidInput`.

PERSON_SIZE = (300, 600)
RED = (200, 30, 30)


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _person() -> bytes:
    return _png(Image.new("RGB", PERSON_SIZE, (90, 90, 90)))


def _red_cutout() -> bytes:
    """A red square on a transparent canvas, like a cutout adapter's output."""
    image = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    image.paste((*RED, 255), (10, 10, 90, 90))
    return _png(image)


def _render(region: TryOnRegion, garment: bytes | None = None) -> Image.Image:
    request = TryOnRequest(
        person_image=_person(), garment_image=garment or _red_cutout(), region=region
    )
    result = OverlayRenderer().render(request)
    assert not result.cached
    return Image.open(io.BytesIO(result.image_png))


@pytest.mark.parametrize("region", list(TryOnRegion))
def test_output_is_a_png_the_size_of_the_person_photo(region: TryOnRegion) -> None:
    image = _render(region)

    assert image.format == "PNG"
    assert image.size == PERSON_SIZE


def test_upper_garment_lands_on_the_torso_not_the_legs() -> None:
    image = _render(TryOnRegion.UPPER).convert("RGB")
    width, height = image.size

    assert image.getpixel((width // 2, round(height * 0.3))) == RED
    assert image.getpixel((width // 2, round(height * 0.8))) != RED


def test_lower_garment_lands_on_the_legs() -> None:
    image = _render(TryOnRegion.LOWER).convert("RGB")
    width, height = image.size

    assert image.getpixel((width // 2, round(height * 0.6))) == RED
    assert image.getpixel((width // 2, round(height * 0.25))) != RED


def test_white_background_of_an_opaque_garment_photo_is_keyed_out() -> None:
    photo = Image.new("RGB", (100, 100), (255, 255, 255))
    photo.paste(RED, (40, 0, 60, 100))
    image = _render(TryOnRegion.UPPER, _png(photo)).convert("RGB")
    width, height = image.size

    # The garment's white margin must not cover the person's grey
    left_edge_of_box = round(width * 0.24)
    assert image.getpixel((left_edge_of_box, round(height * 0.3))) == (90, 90, 90)


def test_unreadable_person_photo_raises_invalid_input() -> None:
    request = TryOnRequest(
        person_image=b"\x89PNG not really", garment_image=_red_cutout(), region=TryOnRegion.UPPER
    )

    with pytest.raises(InvalidInput, match="person_image"):
        OverlayRenderer().render(request)


def test_fully_transparent_garment_raises_invalid_input() -> None:
    empty = _png(Image.new("RGBA", (50, 50), (0, 0, 0, 0)))

    with pytest.raises(InvalidInput, match="transparent"):
        _render(TryOnRegion.UPPER, empty)


def test_build_reports_this_machine() -> None:
    renderer = build(Settings())

    assert renderer.info.runs_on is RunsOn.THIS_MACHINE


def test_overlay_marks_itself_as_a_stand_in(png_bytes: bytes) -> None:
    """The overlay is never a model's try-on, so the app must know to build its own preview."""
    from fitcheck.domain import TryOnRegion, TryOnRequest
    from fitcheck.tryon.overlay import OverlayRenderer

    request = TryOnRequest(
        person_image=png_bytes, garment_image=png_bytes, region=TryOnRegion.UPPER
    )
    assert OverlayRenderer().render(request).fallback is True
