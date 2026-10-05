from __future__ import annotations

import io
import logging
import os
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from threading import Lock
from typing import Protocol

from fastapi import FastAPI, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartParser

from fitcheck_worker.echo import EchoBackend, Region

log = logging.getLogger("fitcheck_worker")


# =============================================================================
# Module Overview
# =============================================================================
# The worker's HTTP surface. `GET /health` names the backend, model, license and
# device; `POST /render` takes multipart `person`, `garment`, `region` and an optional
# `seed`, and answers `image/png`. `create_app` builds it around one
# `Backend`; `main` is the `fitcheck-worker` script. Person photos stay in memory.


class Backend(Protocol):
    """One try-on implementation the worker can serve."""

    name: str
    model: str
    license: str
    device: str

    def warm_up(self) -> None:
        """Load weights so the first render is not the slow one."""
        ...

    def render(
        self, person: Image.Image, garment: Image.Image, region: Region, seed: int | None
    ) -> Image.Image:
        """Paint `garment` onto `person` over `region`."""
        ...


@dataclass(frozen=True)
class WorkerConfig:
    """Worker settings, read from `WORKER_*` env vars."""

    backend: str = "echo"
    token: str | None = None
    host: str = "127.0.0.1"
    port: int = 8008
    max_upload_bytes: int = 15 * 1024 * 1024

    @classmethod
    def from_env(cls) -> WorkerConfig:
        """Read the `WORKER_*` env vars; unset ones keep their defaults."""
        return cls(
            backend=os.environ.get("WORKER_BACKEND", "echo"),
            token=os.environ.get("WORKER_TOKEN") or None,
            host=os.environ.get("WORKER_HOST", "127.0.0.1"),
            port=int(os.environ.get("WORKER_PORT", "8008")),
            max_upload_bytes=int(os.environ.get("WORKER_MAX_UPLOAD_MB", "15")) * 1024 * 1024,
        )


def load_backend(name: str) -> Backend:
    """Return the backend called `name`; only `echo` ships in this build."""
    if name == "echo":
        return EchoBackend()
    raise ValueError(
        f"WORKER_BACKEND `{name}` is not available in this build; use `echo`. "
        "See worker/README.md for how a Leffa backend would plug in."
    )


def create_app(config: WorkerConfig, backend: Backend | None = None) -> FastAPI:
    """Build the worker's FastAPI app around `backend`, warmed up at startup."""
    chosen = backend or load_backend(config.backend)
    # Starlette spools uploads over 1 MB to a temp file; keep person photos in memory (ADR 0003)
    MultiPartParser.spool_max_size = config.max_upload_bytes + 1
    # One render at a time: a second diffusion run on the same GPU only risks running out of memory
    gpu_lock = Lock()
    ready: dict[str, bool] = {"ready": False}

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await run_in_threadpool(chosen.warm_up)
        ready["ready"] = True
        log.info("[Worker] backend %s ready on %s", chosen.name, chosen.device)
        yield

    app = FastAPI(title="FitCheck try-on worker", lifespan=lifespan)

    @app.get("/health")
    def health() -> dict[str, str | bool]:
        """Name the backend, model, license and device, and whether it is warm."""
        return {
            "backend": chosen.name,
            "model": chosen.model,
            "license": chosen.license,
            "device": chosen.device,
            "ready": ready["ready"],
        }

    @app.post("/render", response_class=Response)
    async def render(request: Request) -> Response:
        """Render the try-on; auth and size are checked before the body is read."""
        if config.token is not None and not _token_ok(request, config.token):
            return _error(401, "Missing or wrong bearer token.")
        length = request.headers.get("content-length")
        if length is not None and not length.isdigit():
            return _error(400, "Content-Length must be a whole number of bytes.")
        if length is not None and int(length) > config.max_upload_bytes:
            return _error(413, f"Upload is over {config.max_upload_bytes // (1024 * 1024)} MB.")
        if not ready["ready"]:
            return _error(503, "Model is still loading.")
        form = await request.form(max_files=2, max_fields=4)
        person_file, garment_file = form.get("person"), form.get("garment")
        if not isinstance(person_file, UploadFile) or not isinstance(garment_file, UploadFile):
            return _error(400, "Send `person` and `garment` as files.")
        try:
            region = Region(str(form.get("region", "")))
            seed = _optional_int(form.get("seed"))
            person = _decode(await person_file.read(), "person")
            garment = _decode(await garment_file.read(), "garment")
        except ValueError as exc:
            return _error(422, str(exc))

        def _run() -> bytes:
            with gpu_lock:
                image = chosen.render(person.convert("RGB"), garment, region, seed)
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            return buffer.getvalue()

        try:
            png = await run_in_threadpool(_run)
        except ValueError as exc:
            return _error(422, str(exc))
        return Response(png, media_type="image/png", headers={"Cache-Control": "no-store"})

    return app


def main() -> None:
    """Run the worker with uvicorn, configured from `WORKER_*` env vars."""
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    config = WorkerConfig.from_env()
    uvicorn.run(create_app(config), host=config.host, port=config.port)


# =============================================================================
# Private helpers
# =============================================================================


def _token_ok(request: Request, token: str) -> bool:
    scheme, _, given = request.headers.get("authorization", "").partition(" ")
    return scheme.lower() == "bearer" and secrets.compare_digest(given, token)


def _error(status: int, detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=status)


def _optional_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(str(value))
    except ValueError as exc:
        raise ValueError("seed must be an integer") from exc


def _decode(data: bytes, field: str) -> Image.Image:
    """Decode an upload in memory and apply its EXIF rotation."""
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    # Not an `OSError`, so it would otherwise escape as an unhandled 500
    except Image.DecompressionBombError as exc:
        raise ValueError(f"{field} is too large to decode") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError(f"{field} is not a readable image") from exc
    return ImageOps.exif_transpose(image)
