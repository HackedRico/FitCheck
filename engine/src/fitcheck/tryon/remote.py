from __future__ import annotations

import logging
import time
from collections.abc import Callable
from threading import Lock

import httpx
from pydantic import BaseModel, ConfigDict, SecretStr, ValidationError

from fitcheck.domain import AdapterInfo, RunsOn, TryOnRequest, TryOnResult
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings

log = logging.getLogger(__name__)

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# A tunnel or a cold worker can stall; fail the connect fast and give only inference the long wait
_CONNECT_TIMEOUT_S = 5.0
_HEALTH_TIMEOUT_S = 3.0
_INFO_TTL_S = 60.0
# After a failed `/health`, wait this long before trying again so a down worker costs one stall
_INFO_RETRY_S = 10.0
_DETAIL_CHARS = 200

# =============================================================================
# Module Overview
# =============================================================================
# `RemoteRenderer` sends a try-on request to the FitCheck GPU worker in `worker/` as
# multipart `person`, `garment`, `region` and `seed`, and gets a PNG back. Its `info`
# reports the model and license the worker's `/health` names, refreshed every minute.
# The person photo goes only to that worker, which runs on hardware the team controls.


class _WorkerHealth(BaseModel):
    """The fields of the worker's `GET /health` answer that the engine reads."""

    model_config = ConfigDict(extra="ignore")

    backend: str
    model: str | None = None
    license: str | None = None


class RemoteRenderer:
    """Try-on on a self-hosted GPU worker reached over HTTP."""

    def __init__(
        self,
        base_url: str | None,
        *,
        token: SecretStr | None = None,
        timeout_s: float = 180.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if timeout_s <= 0:
            raise ValueError("timeout_s must be positive")
        if base_url is not None and not base_url.startswith(("http://", "https://")):
            raise AdapterUnavailable(
                f"FITCHECK_TRYON_WORKER_URL `{base_url}` must start with http:// or https://."
            )
        self._base_url = base_url.rstrip("/") if base_url else None
        self._token = token
        self._timeout_s = timeout_s
        self._clock = clock
        self._http = httpx.Client(
            timeout=httpx.Timeout(timeout_s, connect=_CONNECT_TIMEOUT_S),
            # Modal answers a request still running at 150 s with a 303 to poll for the result
            follow_redirects=True,
        )
        # (fetched at, ttl, info); FastAPI runs sync routes on a thread pool
        self._info_cache: tuple[float, float, AdapterInfo] | None = None
        self._lock = Lock()

    @property
    def info(self) -> AdapterInfo:
        """Model and license as the worker's `/health` reports them, cached for a minute."""
        if self._base_url is None:
            return _fallback_info()
        with self._lock:
            cached = self._info_cache
        if cached is not None and self._clock() - cached[0] < cached[1]:
            return cached[2]
        info, ttl = self._fetch_info(self._base_url)
        with self._lock:
            self._info_cache = (self._clock(), ttl, info)
        return info

    def render(self, request: TryOnRequest) -> TryOnResult:
        """Post the person and garment to the worker's `/render` and return its PNG."""
        base_url = self._require_url()
        files = {
            "person": ("person", request.person_image, "application/octet-stream"),
            "garment": ("garment", request.garment_image, "application/octet-stream"),
        }
        data = {"region": request.region.value}
        if request.seed is not None:
            data["seed"] = str(request.seed)
        try:
            response = self._http.post(
                f"{base_url}/render", files=files, data=data, headers=self._auth_headers()
            )
        except httpx.TimeoutException as exc:
            raise AdapterUnavailable(
                f"The try-on worker at {base_url} gave no answer within {self._timeout_s:.0f}s; "
                "raise FITCHECK_TRYON_TIMEOUT_S or check the worker's GPU."
            ) from exc
        except httpx.TransportError as exc:
            raise AdapterUnavailable(
                f"Cannot reach the try-on worker at {base_url}; check FITCHECK_TRYON_WORKER_URL "
                "and that the worker is running."
            ) from exc
        return TryOnResult(image_png=_png_from(response, base_url))

    # -----------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------

    def _require_url(self) -> str:
        if self._base_url is None:
            raise AdapterUnavailable(
                "FITCHECK_TRYON_WORKER_URL is not set; point it at the try-on worker, "
                "such as http://127.0.0.1:8008 for `make worker` on this machine."
            )
        return self._base_url

    def _auth_headers(self) -> dict[str, str]:
        if self._token is None:
            return {}
        return {"Authorization": f"Bearer {self._token.get_secret_value()}"}

    def _fetch_info(self, base_url: str) -> tuple[AdapterInfo, float]:
        """Ask the worker's `/health` what it runs; on failure return a placeholder, retry soon."""
        try:
            response = self._http.get(f"{base_url}/health", timeout=_HEALTH_TIMEOUT_S)
            response.raise_for_status()
            health = _WorkerHealth.model_validate_json(response.content)
        # `info` feeds the pipeline panel and `/health`; a down worker must not break either
        except (httpx.HTTPError, ValidationError) as exc:
            log.warning(
                "[RemoteRenderer] Worker /health at %s failed; reporting no model. Reason: %s",
                base_url,
                exc,
            )
            return _fallback_info(), _INFO_RETRY_S
        info = AdapterInfo(
            name=f"worker-{health.backend}",
            model=health.model,
            license=health.license,
            runs_on=RunsOn.SELF_HOSTED_GPU,
        )
        return info, _INFO_TTL_S


def build(settings: Settings) -> RemoteRenderer:
    """Return a renderer for the worker at `FITCHECK_TRYON_WORKER_URL`."""
    return RemoteRenderer(
        settings.tryon_worker_url,
        token=settings.tryon_worker_token,
        timeout_s=settings.tryon_timeout_s,
    )


def _fallback_info() -> AdapterInfo:
    return AdapterInfo(name="remote-worker", runs_on=RunsOn.SELF_HOSTED_GPU)


def _png_from(response: httpx.Response, base_url: str) -> bytes:
    """Return the PNG body of a worker answer, or raise the error class its status calls for."""
    status = response.status_code
    if status == httpx.codes.OK:
        if not response.content.startswith(_PNG_SIGNATURE):
            raise AdapterUnavailable(f"The try-on worker at {base_url} answered without a PNG.")
        return response.content
    detail = _detail(response)
    if status in (httpx.codes.UNAUTHORIZED, httpx.codes.FORBIDDEN):
        raise AdapterUnavailable(
            "The try-on worker rejected the token; set FITCHECK_TRYON_WORKER_TOKEN "
            "to the worker's WORKER_TOKEN."
        )
    if status in (
        httpx.codes.BAD_REQUEST,
        httpx.codes.REQUEST_ENTITY_TOO_LARGE,
        httpx.codes.UNPROCESSABLE_ENTITY,
    ):
        raise InvalidInput(f"The try-on worker could not use these images: {detail}")
    if status == httpx.codes.SERVICE_UNAVAILABLE:
        raise AdapterUnavailable(f"The try-on worker is not ready: {detail}")
    raise AdapterUnavailable(
        f"The try-on worker at {base_url} failed with HTTP {status}: {detail} "
        "Check FITCHECK_TRYON_WORKER_URL."
    )


def _detail(response: httpx.Response) -> str:
    """Pull FastAPI's `detail` out of an error answer, falling back to the raw text, trimmed."""
    try:
        body = response.json()
    except ValueError:
        return response.text[:_DETAIL_CHARS] or response.reason_phrase
    detail = body.get("detail") if isinstance(body, dict) else None
    return str(detail if detail is not None else body)[:_DETAIL_CHARS]
