from __future__ import annotations

import importlib.util
import logging
from threading import Lock
from typing import Any

from fitcheck.domain import AdapterInfo, RunsOn
from fitcheck.errors import AdapterUnavailable
from fitcheck.settings import Settings
from fitcheck.vision import images

log = logging.getLogger(__name__)

# On a tee-on-a-hanger photo on an M2 CPU, IS-Net dropped the hanger wire and took
# 1.3 s; `birefnet-general-lite` kept the wire and took 9 to 13 s; `u2net_cloth_seg`
# is trained on clothes worn by people and mangled the garment into body-region masks.
# `bria-rmbg` is CC BY-NC, which an open-source entry cannot ship.
MODEL = "isnet-general-use"
MODEL_LICENSE = "Apache-2.0"
MODEL_DOWNLOAD_MB = 170
# Model input is 1024 px, so a bigger photo only slows the final mask resize
MAX_SIDE_PX = 1536
# A transparent upload is flattened onto white, the backdrop these models handle best
BACKDROP = (255, 255, 255)

# =============================================================================
# Module Overview
# =============================================================================
# `RembgCutter` removes the background and hanger from a garment photo with rembg
# and the open IS-Net model on this machine's CPU. rembg loads lazily: the first
# `cut` downloads the weights to `~/.rembg` (or `$REMBG_HOME`) and builds the ONNX
# session, which the instance then keeps for every later call.


class RembgCutter:
    """Background removal with rembg and IS-Net; the ONNX session is built once and cached."""

    info = AdapterInfo(
        name="rembg", model=MODEL, license=MODEL_LICENSE, runs_on=RunsOn.THIS_MACHINE
    )

    def __init__(self) -> None:
        # rembg types are not published; the session is opaque to us
        self._session: Any = None
        # FastAPI runs sync routes on a thread pool, and two first calls must not both download
        self._lock = Lock()

    def cut(self, image: bytes) -> bytes:
        """Return a PNG of the garment with hanger and background made transparent."""
        photo = images.fit_within(images.open_image(image), MAX_SIDE_PX)
        from rembg import remove

        cutout = remove(
            images.flatten(photo, BACKDROP), session=self._ensure_session(), post_process_mask=True
        )
        return images.encode_png(cutout)

    def _ensure_session(self) -> Any:
        """Return the cached rembg session, building it (and downloading weights) on first use."""
        with self._lock:
            if self._session is None:
                self._session = _new_session()
            return self._session


def _new_session() -> Any:
    """Load the rembg model, downloading it on the first run."""
    log.info(
        "[Cutout] Loading rembg `%s`; the first run downloads about %d MB of weights.",
        MODEL,
        MODEL_DOWNLOAD_MB,
    )
    from rembg import new_session

    try:
        return new_session(MODEL)
    # Download and ONNX load fail in many library-specific ways; all mean the cutter cannot run
    except Exception as exc:
        raise AdapterUnavailable(
            f"Could not load rembg model `{MODEL}`: {exc}. The first run downloads about "
            f"{MODEL_DOWNLOAD_MB} MB to `~/.rembg`; check the network, or set "
            "`FITCHECK_CUTOUT=none`."
        ) from exc


def build(settings: Settings) -> RembgCutter:
    """Return a `RembgCutter`, or raise `AdapterUnavailable` if the `cutout` extra is missing."""
    # rembg calls `sys.exit` on import when onnxruntime is absent, so check both before importing
    missing = [name for name in ("rembg", "onnxruntime") if importlib.util.find_spec(name) is None]
    if missing:
        raise AdapterUnavailable(
            f"{' and '.join(missing)} not installed; run `uv sync --extra cutout` "
            "or set `FITCHECK_CUTOUT=none`."
        )
    return RembgCutter()
