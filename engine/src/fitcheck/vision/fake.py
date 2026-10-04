from __future__ import annotations

from collections import Counter

from PIL import Image

from fitcheck.domain import (
    AdapterInfo,
    Box,
    Category,
    ColorFamily,
    FoundGarment,
    GarmentTags,
    Pattern,
    RunsOn,
)
from fitcheck.errors import TaggingFailed
from fitcheck.settings import Settings
from fitcheck.vision import images
from fitcheck.vision.images import RGB

# One reference color per family; `MULTI` has none because no single pixel is multicolored
PALETTE: dict[ColorFamily, RGB] = {
    ColorFamily.BLACK: (25, 25, 25),
    ColorFamily.WHITE: (245, 245, 245),
    ColorFamily.GREY: (128, 128, 128),
    ColorFamily.NAVY: (30, 40, 80),
    ColorFamily.BLUE: (50, 110, 200),
    ColorFamily.GREEN: (50, 140, 70),
    ColorFamily.YELLOW: (240, 205, 40),
    ColorFamily.RED: (195, 30, 40),
    ColorFamily.PINK: (240, 155, 185),
    ColorFamily.BROWN: (115, 75, 45),
    ColorFamily.BEIGE: (220, 200, 165),
}
# A 64 px thumbnail keeps the color vote fast and still sees every large region
_SAMPLE_SIDE_PX = 64
_OPAQUE_ALPHA = 128

# =============================================================================
# Module Overview
# =============================================================================
# `FakeTagger` tags garments with no model, for offline demos and tests. It votes
# each garment pixel to the nearest `PALETTE` color and reports the winning
# `ColorFamily`; every other tag is fixed. The same image always gets the same tags.
# `find_all` treats a whole photo as one garment.


class FakeTagger:
    """Deterministic tags from pixel colors alone: a solid top in the dominant color family."""

    info = AdapterInfo(name="fake-tagger", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

    def tag(self, image_png: bytes) -> GarmentTags:
        """Tag `image_png` as a solid top in its dominant color; raise `TaggingFailed` if blank."""
        family = dominant_family(images.open_image(image_png))
        return GarmentTags(
            category=Category.TOP,
            color_family=family,
            pattern=Pattern.SOLID,
            warmth=2,
            waterproof=False,
            formality=2,
            description=f"{family.value} top, offline fake tags",
        )

    def find_all(self, image_png: bytes) -> list[FoundGarment]:
        """Report the whole photo as one garment, since the fake has no detector."""
        whole = Box(left=0, top=0, right=1, bottom=1)
        return [FoundGarment(tags=self.tag(image_png), box=whole)]


def dominant_family(image: Image.Image) -> ColorFamily:
    """Return the color family that most of the garment's pixels sit nearest to."""
    pixels = _garment_pixels(image)
    if not pixels:
        raise TaggingFailed("The cutout has no visible pixels to tag.")
    votes = Counter(nearest_family(pixel) for pixel in pixels)
    return votes.most_common(1)[0][0]


def nearest_family(rgb: RGB) -> ColorFamily:
    """Return the `PALETTE` family closest to `rgb`."""
    return min(PALETTE, key=lambda family: _distance(rgb, PALETTE[family]))


def _garment_pixels(image: Image.Image) -> list[RGB]:
    """Return the colors of the pixels that belong to the garment, from a small thumbnail."""
    if images.has_transparent_pixels(image):
        region = image
    else:
        # Without a cutout the backdrop fills the frame; a garment sits in the central half
        width, height = image.size
        region = image.crop((width // 4, height // 4, width - width // 4, height - height // 4))
    raw = images.fit_within(region, _SAMPLE_SIDE_PX).convert("RGBA").tobytes()
    return [
        (raw[i], raw[i + 1], raw[i + 2])
        for i in range(0, len(raw), 4)
        if raw[i + 3] >= _OPAQUE_ALPHA
    ]


def _distance(a: RGB, b: RGB) -> float:
    """Return the "redmean" color distance, which tracks how far apart eyes see two colors."""
    mean_red = (a[0] + b[0]) / 2
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    return (2 + mean_red / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean_red) / 256) * db * db


def build(settings: Settings) -> FakeTagger:
    """Return a `FakeTagger`; it needs no settings."""
    return FakeTagger()
