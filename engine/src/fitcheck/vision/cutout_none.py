from __future__ import annotations

from fitcheck.domain import AdapterInfo, RunsOn
from fitcheck.settings import Settings
from fitcheck.vision import images

# Try-on models paint at 768 x 1024; a bigger cutout only costs disk and upload time
MAX_SIDE_PX = 1536

# =============================================================================
# Module Overview
# =============================================================================
# `PassthroughCutter` fills the cutout slot without removing anything. It turns any
# PNG, JPEG, WebP or GIF upload into an upright PNG no larger than `MAX_SIDE_PX`,
# so every later step sees the same format whether or not rembg is installed.


class PassthroughCutter:
    """Keeps the background; only normalizes the image to an upright, bounded PNG."""

    info = AdapterInfo(name="no-cutout", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

    def cut(self, image: bytes) -> bytes:
        """Return `image` upright, at most `MAX_SIDE_PX` on its longer side, as PNG."""
        return images.encode_png(images.fit_within(images.open_image(image), MAX_SIDE_PX))


def build(settings: Settings) -> PassthroughCutter:
    """Return a `PassthroughCutter`; it needs no settings."""
    return PassthroughCutter()
