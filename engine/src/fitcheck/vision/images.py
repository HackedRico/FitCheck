from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from fitcheck.errors import InvalidInput

RGB = tuple[int, int, int]

# =============================================================================
# Module Overview
# =============================================================================
# Image plumbing shared by the cutters and taggers. `open_image` turns upload bytes
# into an upright RGB or RGBA image or raises `InvalidInput`; `fit_within`, `flatten`,
# `encode_png` and `encode_jpeg` shrink, drop transparency and encode for storage or a model.


def open_image(data: bytes) -> Image.Image:
    """Decode `data` into an upright RGB or RGBA image, or raise `InvalidInput`."""
    if not data:
        raise InvalidInput("image is empty; send a PNG, JPEG or WebP file.")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Image.DecompressionBombError as exc:
        raise InvalidInput("image is too large to decode; send a photo under 90 MP.") from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise InvalidInput("image could not be decoded; send a PNG, JPEG or WebP file.") from exc
    # Phone cameras store rotation in EXIF instead of rotating the pixels
    upright = ImageOps.exif_transpose(image)
    return upright.convert("RGBA" if upright.has_transparency_data else "RGB")


def has_transparent_pixels(image: Image.Image) -> bool:
    """Return whether any pixel of `image` is less than fully opaque."""
    # `has_transparency_data` is true for every RGBA image, even a fully opaque one
    if image.mode != "RGBA":
        return False
    lowest_alpha = image.getchannel("A").getextrema()[0]
    # A single band reports (min, max) as numbers; the stub also allows per-band tuples
    return isinstance(lowest_alpha, int | float) and lowest_alpha < 255


def fit_within(image: Image.Image, max_side: int) -> Image.Image:
    """Return `image` scaled down so its longer side is at most `max_side`; never scale up."""
    if max_side < 1:
        raise ValueError("max_side must be at least 1")
    if max(image.size) <= max_side:
        return image
    smaller = image.copy()
    smaller.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return smaller


def flatten(image: Image.Image, backdrop: RGB) -> Image.Image:
    """Return an RGB copy of `image` with any transparency composited onto `backdrop`."""
    if image.mode != "RGBA":
        return image.convert("RGB")
    canvas = Image.new("RGB", image.size, backdrop)
    canvas.paste(image, mask=image.getchannel("A"))
    return canvas


def encode_png(image: Image.Image) -> bytes:
    """Return `image` as PNG bytes, keeping any alpha channel."""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def encode_jpeg(image: Image.Image, quality: int = 90) -> bytes:
    """Return `image` as JPEG bytes; call `flatten` first if it has transparency."""
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()
