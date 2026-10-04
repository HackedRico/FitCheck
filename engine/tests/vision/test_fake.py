from __future__ import annotations

import io
from collections.abc import Callable

import pytest
from PIL import Image

from fitcheck.domain import Category, ColorFamily, Pattern, RunsOn
from fitcheck.errors import InvalidInput, TaggingFailed
from fitcheck.settings import Settings
from fitcheck.vision.fake import FakeTagger, build, nearest_family

RGB = tuple[int, int, int]


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_cutout_is_tagged_by_its_visible_color(cutout_png: Callable[[RGB], bytes]) -> None:
    tags = FakeTagger().tag(cutout_png((30, 40, 85)))

    assert tags.color_family is ColorFamily.NAVY


def test_photo_without_transparency_is_read_from_the_center(png_bytes: bytes) -> None:
    # The fixture is mostly white backdrop around a yellow block
    assert FakeTagger().tag(png_bytes).color_family is ColorFamily.YELLOW


def test_everything_but_color_is_fixed(cutout_png: Callable[[RGB], bytes]) -> None:
    tags = FakeTagger().tag(cutout_png((200, 30, 40)))

    assert (tags.category, tags.pattern, tags.warmth, tags.formality, tags.waterproof) == (
        Category.TOP,
        Pattern.SOLID,
        2,
        2,
        False,
    )
    assert tags.description == "red top, offline fake tags"


def test_same_image_gives_same_tags(cutout_png: Callable[[RGB], bytes]) -> None:
    image = cutout_png((120, 80, 50))

    assert FakeTagger().tag(image) == FakeTagger().tag(image)


@pytest.mark.parametrize(
    ("rgb", "family"),
    [
        ((10, 10, 10), ColorFamily.BLACK),
        ((250, 250, 250), ColorFamily.WHITE),
        ((135, 135, 135), ColorFamily.GREY),
        ((25, 35, 75), ColorFamily.NAVY),
        ((60, 120, 210), ColorFamily.BLUE),
        ((40, 150, 60), ColorFamily.GREEN),
        ((245, 210, 30), ColorFamily.YELLOW),
        ((210, 25, 35), ColorFamily.RED),
        ((245, 160, 190), ColorFamily.PINK),
        ((110, 70, 40), ColorFamily.BROWN),
        ((225, 205, 170), ColorFamily.BEIGE),
    ],
)
def test_nearest_family(rgb: RGB, family: ColorFamily) -> None:
    assert nearest_family(rgb) is family


def test_fully_transparent_cutout_fails_tagging() -> None:
    blank = _png(Image.new("RGBA", (32, 32), (0, 0, 0, 0)))

    with pytest.raises(TaggingFailed):
        FakeTagger().tag(blank)


def test_non_image_is_invalid_input() -> None:
    with pytest.raises(InvalidInput):
        FakeTagger().tag(b"not an image")


def test_build_runs_on_this_machine() -> None:
    assert build(Settings()).info.runs_on is RunsOn.THIS_MACHINE
