from __future__ import annotations

import io

from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError

from fitcheck.domain import AdapterInfo, RunsOn, TryOnRegion, TryOnRequest, TryOnResult
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings

# Where each region sits on a standing, full-body, camera-facing photo, as fractions
# of the photo's (left, top, right, bottom)
_REGION_BOX: dict[TryOnRegion, tuple[float, float, float, float]] = {
    TryOnRegion.UPPER: (0.22, 0.18, 0.78, 0.56),
    TryOnRegion.LOWER: (0.27, 0.47, 0.73, 0.93),
    TryOnRegion.FULL: (0.22, 0.18, 0.78, 0.86),
}
# Product photos without transparency usually sit on near-white; key that out
_WHITE_KEY = 240
_LABEL = "preview"

# =============================================================================
# Module Overview
# =============================================================================
# `OverlayRenderer` pastes the garment cutout onto the person photo with Pillow at a
# fixed box per `TryOnRegion` and stamps a "preview" label. No model runs, so it is
# instant and offline: the default for tests and the stage fallback when the GPU
# worker is down. Both images stay in memory.


class OverlayRenderer:
    """Flat 2D composite of the garment on the person; no diffusion, no drape."""

    info = AdapterInfo(name="overlay", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

    def render(self, request: TryOnRequest) -> TryOnResult:
        """Return a PNG the size of the person photo with the garment pasted on its region."""
        person = _open(request.person_image, "person_image").convert("RGBA")
        garment = _keyed(_open(request.garment_image, "garment_image"))
        bbox = garment.getbbox()
        if bbox is None:
            raise InvalidInput(
                "garment_image is fully transparent; send a cutout with the garment."
            )
        garment = garment.crop(bbox)

        left, top, right, bottom = _box(person.size, request.region)
        # Scale up as well as down, so a small cutout still covers the region
        garment = ImageOps.contain(garment, (right - left, bottom - top), Image.Resampling.LANCZOS)
        # Center across the body, hang from the top of the box like a garment on shoulders or hips
        x = left + (right - left - garment.width) // 2
        person.alpha_composite(garment, (x, top))
        _stamp_label(person)

        buffer = io.BytesIO()
        person.convert("RGB").save(buffer, format="PNG")
        # A pasted photo is never a real try-on, so let the app swap in its on-device preview
        return TryOnResult(image_png=buffer.getvalue(), fallback=True)


def build(settings: Settings) -> OverlayRenderer:
    """Return the overlay renderer; it needs no settings."""
    return OverlayRenderer()


# =============================================================================
# Private helpers
# =============================================================================


def _open(data: bytes, field: str) -> Image.Image:
    """Decode `data` and apply its EXIF rotation, so phone photos come out upright."""
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    # Not an `OSError`, so it would otherwise leave the API as an unhandled 500
    except Image.DecompressionBombError as exc:
        raise InvalidInput(f"{field} is too large to decode.") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidInput(f"{field} is not a readable image.") from exc
    return ImageOps.exif_transpose(image)


def _keyed(garment: Image.Image) -> Image.Image:
    """Return `garment` as RGBA; without real transparency, make near-white pixels clear."""
    rgba = garment.convert("RGBA")
    alpha = rgba.getchannel("A")
    opaque_pixels = alpha.histogram()[255]
    if opaque_pixels < alpha.width * alpha.height:
        return rgba
    grey = rgba.convert("L")
    rgba.putalpha(grey.point(lambda v: 0 if v >= _WHITE_KEY else 255))
    return rgba


def _box(size: tuple[int, int], region: TryOnRegion) -> tuple[int, int, int, int]:
    """Scale the region's fractional box to pixel coordinates on a `size` photo."""
    width, height = size
    left, top, right, bottom = _REGION_BOX[region]
    return (round(left * width), round(top * height), round(right * width), round(bottom * height))


def _stamp_label(image: Image.Image) -> None:
    """Draw a small "preview" tag in the top-left corner so nobody mistakes this for a render."""
    draw = ImageDraw.Draw(image)
    font_size = max(12, image.height // 40)
    font = ImageFont.load_default(size=font_size)
    pad = font_size // 2
    left, top, right, bottom = draw.textbbox((pad * 2, pad * 2), _LABEL, font=font)
    draw.rounded_rectangle(
        (left - pad, top - pad, right + pad, bottom + pad), radius=pad, fill=(20, 20, 20, 255)
    )
    draw.text((pad * 2, pad * 2), _LABEL, font=font, fill=(255, 255, 255, 255))
