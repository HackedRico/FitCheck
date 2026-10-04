from __future__ import annotations

import io
import shutil
import tempfile
from collections.abc import Callable
from pathlib import Path
from threading import Lock
from typing import Any

import httpx
from PIL import Image, UnidentifiedImageError

from fitcheck.domain import AdapterInfo, RunsOn, TryOnRegion, TryOnRequest, TryOnResult
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings

# The Leffa Space's virtual try-on endpoint, as its `view_api()` lists it
_ENDPOINT = "/leffa_predict_vt"
# The Space's own defaults; 30 is also the lowest step count its UI allows
_STEPS = 30
_GUIDANCE = 2.5
_DEFAULT_SEED = 42
# Leffa ships a VITON-HD model trained on tops and a DressCode model for bottoms and dresses
_LEFFA_ARGS: dict[TryOnRegion, tuple[str, str]] = {
    TryOnRegion.UPPER: ("viton_hd", "upper_body"),
    TryOnRegion.LOWER: ("dress_code", "lower_body"),
    TryOnRegion.FULL: ("dress_code", "dresses"),
}
_DOWNLOAD_TIMEOUT_S = 30.0

ClientFactory = Callable[[str], Any]

# =============================================================================
# Module Overview
# =============================================================================
# `HfSpaceRenderer` runs Leffa try-on on a public Hugging Face Space through
# `gradio_client`, for teammates without a GPU. The person photo leaves this machine
# for Hugging Face, so `info.runs_on` is `PUBLIC_API` and the UI warns. `gradio_client`
# only uploads from file paths, so the two inputs sit in a private temp folder for the
# length of one call and are deleted in a `finally` block; outputs are read into memory.


class HfSpaceRenderer:
    """Leffa try-on on a Hugging Face Space; free, queued and rate limited."""

    def __init__(
        self,
        space: str,
        *,
        timeout_s: float = 180.0,
        client_factory: ClientFactory | None = None,
    ) -> None:
        if not space.strip():
            raise ValueError("space must name a Hugging Face Space, such as `franciszzj/Leffa`")
        if timeout_s <= 0:
            raise ValueError("timeout_s must be positive")
        self._space = space
        self._timeout_s = timeout_s
        self._client_factory = client_factory or _gradio_client
        self._client: Any = None
        # FastAPI runs sync routes on a thread pool; connect to the Space once
        self._lock = Lock()
        self.info = AdapterInfo(
            name="hf-space",
            model=f"Leffa virtual try-on on huggingface.co/spaces/{space}",
            license="MIT",
            runs_on=RunsOn.PUBLIC_API,
        )

    def render(self, request: TryOnRequest) -> TryOnResult:
        """Send both images to the Space, wait for the render and return it as PNG."""
        from gradio_client import handle_file

        client = self._connect()
        model_type, garment_type = _LEFFA_ARGS[request.region]
        seed = request.seed if request.seed is not None else _DEFAULT_SEED
        # ADR 0003: the person photo touches disk only here, in a 0700 folder deleted below
        folder = Path(tempfile.mkdtemp(prefix="fitcheck-tryon-"))
        try:
            person_path = folder / "person"
            garment_path = folder / "garment"
            person_path.write_bytes(request.person_image)
            garment_path.write_bytes(request.garment_image)
            job = client.submit(
                handle_file(str(person_path)),
                handle_file(str(garment_path)),
                False,
                _STEPS,
                _GUIDANCE,
                seed,
                model_type,
                garment_type,
                False,
                api_name=_ENDPOINT,
            )
            outputs = self._wait(job)
        finally:
            shutil.rmtree(folder, ignore_errors=True)
        image = self._download(outputs, client)
        return TryOnResult(image_png=_to_png(image))

    # -----------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------

    def _connect(self) -> Any:
        """Return the cached Gradio client, connecting to the Space on first use."""
        with self._lock:
            if self._client is None:
                try:
                    self._client = self._client_factory(self._space)
                # `gradio_client` raises bare `ValueError` and `httpx` errors for a missing,
                # sleeping or building Space; all of them mean "not usable right now"
                except (ValueError, httpx.HTTPError, OSError) as exc:
                    raise AdapterUnavailable(
                        f"Cannot connect to the Hugging Face Space `{self._space}`; check "
                        f"FITCHECK_TRYON_HF_SPACE and that the Space is running. Reason: {exc}"
                    ) from exc
            return self._client

    def _wait(self, job: Any) -> Any:
        """Block on the Space's queue for up to the timeout, mapping its errors to ours."""
        from gradio_client.utils import QueueError, TooManyRequestsError

        try:
            return job.result(timeout=self._timeout_s)
        except TimeoutError as exc:
            job.cancel()
            raise AdapterUnavailable(
                f"The Space `{self._space}` gave no answer within {self._timeout_s:.0f}s; its "
                "queue may be long. Raise FITCHECK_TRYON_TIMEOUT_S or use the worker."
            ) from exc
        except (QueueError, TooManyRequestsError) as exc:
            raise AdapterUnavailable(f"The Space `{self._space}` is busy: {exc}") from exc
        except (ValueError, httpx.HTTPError, OSError) as exc:
            raise _from_space_error(self._space, exc) from exc

    def _download(self, outputs: Any, client: Any) -> bytes:
        """Fetch the generated image into memory from the URL the Space returned."""
        generated = outputs[0] if isinstance(outputs, (list, tuple)) and outputs else None
        url = generated.get("url") if isinstance(generated, dict) else None
        if not isinstance(url, str):
            raise AdapterUnavailable(
                f"The Space `{self._space}` answered in an unexpected shape; it may have "
                f"changed its API. Check `{_ENDPOINT}` in its view_api()."
            )
        headers = getattr(client, "headers", None) or {}
        try:
            response = httpx.get(
                url, headers=headers, follow_redirects=True, timeout=_DOWNLOAD_TIMEOUT_S
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise AdapterUnavailable(
                f"Could not download the render from `{self._space}`: {exc}"
            ) from exc
        return response.content


def build(settings: Settings) -> HfSpaceRenderer:
    """Return a renderer for the Space named by `FITCHECK_TRYON_HF_SPACE`."""
    token = settings.hf_token.get_secret_value() if settings.hf_token else None
    return HfSpaceRenderer(
        settings.tryon_hf_space,
        timeout_s=settings.tryon_timeout_s,
        client_factory=lambda space: _gradio_client(space, token),
    )


def _gradio_client(space: str, token: str | None = None) -> Any:
    """Connect to `space`; outputs stay on the Space so nothing lands in a local temp dir."""
    try:
        from gradio_client import Client
    # Optional dependency: the core engine must import without the `hfspace` extra
    except ImportError as exc:
        raise AdapterUnavailable(
            "FITCHECK_TRYON=hf_space needs gradio-client; run `uv sync --all-extras` in engine/."
        ) from exc
    # With no token, gradio falls back to `hf auth login`, else calls anonymously with the
    # smallest ZeroGPU allowance; a signed-in user gets more
    return Client(space, token=token, verbose=False, download_files=False)


def _from_space_error(space: str, exc: Exception) -> Exception:
    """Translate a failed Space call: no person found is the caller's problem, the rest is ours."""
    message = str(exc)
    if "quota" in message.lower():
        return AdapterUnavailable(
            f"The Space `{space}` refused: {message} Set HF_TOKEN to a Hugging Face token "
            "for more ZeroGPU time, or use FITCHECK_TRYON=remote."
        )
    # Leffa's pose and parsing steps index the first detected body; an empty photo fails there
    if message.strip() == "IndexError":
        return InvalidInput(
            "The try-on model found no person in the photo; "
            "use a full-body photo facing the camera."
        )
    return AdapterUnavailable(f"The Space `{space}` failed: {message}")


def _to_png(image: bytes) -> bytes:
    """Re-encode the Space's output, usually WebP, as PNG."""
    try:
        with Image.open(io.BytesIO(image)) as decoded:
            buffer = io.BytesIO()
            decoded.convert("RGB").save(buffer, format="PNG")
    except (UnidentifiedImageError, OSError) as exc:
        raise AdapterUnavailable("The Space returned something that is not an image.") from exc
    return buffer.getvalue()
