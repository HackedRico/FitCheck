from __future__ import annotations

import io

import pytest
from PIL import Image

from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings
from fitcheck.vision.cutout_none import MAX_SIDE_PX, PassthroughCutter, build

_EXIF_ORIENTATION = 0x0112
_ROTATED_90_CW = 6


def _encode(image: Image.Image, fmt: str, **params: object) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **params)
    return buffer.getvalue()


def _decode(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


@pytest.mark.parametrize("fmt", ["JPEG", "WEBP", "GIF", "PNG"])
def test_any_format_comes_out_as_png(fmt: str) -> None:
    source = _encode(Image.new("RGB", (40, 60), (200, 30, 40)), fmt)

    out = _decode(PassthroughCutter().cut(source))

    assert out.format == "PNG"
    assert out.size == (40, 60)


def test_large_photo_is_shrunk_to_max_side() -> None:
    source = _encode(Image.new("RGB", (4000, 3000), "white"), "JPEG")

    out = _decode(PassthroughCutter().cut(source))

    assert out.size == (MAX_SIDE_PX, MAX_SIDE_PX * 3 // 4)


def test_exif_rotation_is_applied() -> None:
    exif = Image.Exif()
    exif[_EXIF_ORIENTATION] = _ROTATED_90_CW
    source = _encode(Image.new("RGB", (60, 40), "white"), "JPEG", exif=exif)

    assert _decode(PassthroughCutter().cut(source)).size == (40, 60)


def test_transparency_is_kept() -> None:
    source = _encode(Image.new("RGBA", (10, 10), (0, 0, 0, 0)), "PNG")

    out = _decode(PassthroughCutter().cut(source))

    assert out.mode == "RGBA"
    assert out.getpixel((5, 5)) == (0, 0, 0, 0)


@pytest.mark.parametrize("data", [b"", b"plain text, not pixels", b"\x89PNG\r\n\x1a\ntruncated"])
def test_unreadable_upload_is_invalid_input(data: bytes) -> None:
    with pytest.raises(InvalidInput):
        PassthroughCutter().cut(data)


def test_build_names_no_model() -> None:
    assert build(Settings()).info.model is None
