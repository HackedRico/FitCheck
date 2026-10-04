from __future__ import annotations

from enum import StrEnum

from PIL import Image, ImageDraw, ImageOps

# Fractions of the person photo, as (left, top, right, bottom), per region
_REGION_BOX: dict[str, tuple[float, float, float, float]] = {
    "upper": (0.22, 0.18, 0.78, 0.56),
    "lower": (0.27, 0.47, 0.73, 0.93),
    "full": (0.22, 0.18, 0.78, 0.86),
}
# Product photos without transparency usually sit on near-white; key that out
_WHITE_KEY = 240

# =============================================================================
# Module Overview
# =============================================================================
# The `echo` backend: a Pillow composite of the garment on the person, no model and
# no torch. It proves the worker's wire format end to end on any laptop. `Region`
# is the set of body regions every backend accepts.


class Region(StrEnum):
    """The body region a try-on backend repaints."""

    UPPER = "upper"
    LOWER = "lower"
    FULL = "full"


class EchoBackend:
    """Pastes the garment on the region's box and stamps "echo"; for testing only."""

    name = "echo"
    model = "pillow-composite"
    license = "Apache-2.0"
    device = "cpu"

    def warm_up(self) -> None:
        """Nothing to load."""

    def render(
        self, person: Image.Image, garment: Image.Image, region: Region, seed: int | None
    ) -> Image.Image:
        """Return `person` with `garment` pasted on `region`; `seed` is ignored."""
        canvas = person.convert("RGBA")
        cutout = _keyed(garment)
        bbox = cutout.getbbox()
        if bbox is None:
            raise ValueError("garment is fully transparent")
        cutout = cutout.crop(bbox)
        width, height = canvas.size
        left, top, right, bottom = (
            round(f * size)
            for f, size in zip(
                _REGION_BOX[region.value], (width, height, width, height), strict=True
            )
        )
        cutout = ImageOps.contain(cutout, (right - left, bottom - top))
        canvas.alpha_composite(cutout, (left + (right - left - cutout.width) // 2, top))
        ImageDraw.Draw(canvas).text((8, 8), "echo", fill=(255, 0, 0, 255))
        return canvas.convert("RGB")


def _keyed(garment: Image.Image) -> Image.Image:
    """Return RGBA; without real transparency, make near-white pixels clear."""
    rgba = garment.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.histogram()[255] < alpha.width * alpha.height:
        return rgba
    rgba.putalpha(rgba.convert("L").point(lambda v: 0 if v >= _WHITE_KEY else 255))
    return rgba
