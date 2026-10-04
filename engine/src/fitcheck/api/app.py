from __future__ import annotations

import base64
import json
from decimal import Decimal
from typing import Annotated

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from fitcheck.domain import (
    AdapterInfo,
    ChatTurn,
    Garment,
    GarmentTags,
    Location,
    Pipeline,
    Source,
    StylistReply,
    TryOnRegion,
    Verdict,
    WeekContext,
)
from fitcheck.engine import Engine
from fitcheck.errors import AdapterUnavailable, FitCheckError, InvalidInput, NotFound, TaggingFailed
from fitcheck.settings import Settings
from fitcheck.wiring import build_engine

# =============================================================================
# Module Overview
# =============================================================================
# The HTTP layer over `Engine`: one route per engine method, no logic of its own.
# Images go up as multipart files and come back as base64 PNG strings so every
# response is plain JSON. `create_app` builds the engine from settings unless a test
# passes one in; `/openapi.json` is the contract the web app generates types from.

_STATUS_BY_ERROR: dict[type[FitCheckError], int] = {
    InvalidInput: 400,
    NotFound: 404,
    TaggingFailed: 422,
    AdapterUnavailable: 503,
}


# =============================================================================
# Wire schemas
# =============================================================================


class _Wire(BaseModel):
    model_config = ConfigDict(frozen=True)


class HealthOut(_Wire):
    status: str
    adapters: dict[str, AdapterInfo]


class ScanOut(_Wire):
    tags: GarmentTags
    cutout_png_base64: str
    pipeline: Pipeline


class JudgeIn(_Wire):
    owner: str
    tags: GarmentTags
    location: Location | None = None


class JudgeOut(_Wire):
    verdict: Verdict
    week: WeekContext
    pipeline: Pipeline


class WeekOut(_Wire):
    week: WeekContext
    pipeline: Pipeline


class RenderOut(_Wire):
    image_png_base64: str
    # True when the image is a pre-computed fallback; the UI must label it "cached"
    cached: bool
    pipeline: Pipeline


class ChatIn(_Wire):
    owner: str
    message: Annotated[str, Field(min_length=1, max_length=2000)]
    history: list[ChatTurn] = []
    candidate: GarmentTags | None = None
    verdict: Verdict | None = None
    location: Location | None = None


class ChatOut(_Wire):
    reply: StylistReply
    pipeline: Pipeline


class AddOut(_Wire):
    garment: Garment
    pipeline: Pipeline


class ForgetOut(_Wire):
    deleted: int


# =============================================================================
# App factory
# =============================================================================


def create_app(engine: Engine | None = None, settings: Settings | None = None) -> FastAPI:
    """Return the FastAPI app; builds the engine from `settings` when none is passed."""
    settings = settings or Settings()
    app = FastAPI(
        title="FitCheck engine",
        version="0.1.0",
        summary="Scan a garment, see it on you, get BUY, SKIP or TRY-WITH.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Built on first request, so `/openapi.json` works without any backing service
    state: dict[str, Engine] = {"engine": engine} if engine else {}

    def get_engine() -> Engine:
        if "engine" not in state:
            state["engine"] = build_engine(settings)
        return state["engine"]

    @app.exception_handler(FitCheckError)
    async def _on_fitcheck_error(_: Request, exc: FitCheckError) -> JSONResponse:
        status = next((code for cls, code in _STATUS_BY_ERROR.items() if isinstance(exc, cls)), 500)
        return JSONResponse(status_code=status, content={"detail": str(exc)})

    # -----------------------------------------------------------------
    # Routes
    # -----------------------------------------------------------------

    @app.get("/health", response_model=HealthOut)
    def health() -> HealthOut:
        """List the adapter running in every slot."""
        return HealthOut(status="ok", adapters=get_engine().adapters())

    @app.post("/scan", response_model=ScanOut)
    def scan(image: Annotated[UploadFile, File()]) -> ScanOut:
        """Cut out and tag one garment photo. Nothing is stored."""
        result = get_engine().scan(image.file.read())
        return ScanOut(
            tags=result.tags, cutout_png_base64=_b64(result.cutout_png), pipeline=result.pipeline
        )

    @app.post("/judge", response_model=JudgeOut)
    def judge(body: JudgeIn) -> JudgeOut:
        """Return BUY, SKIP or TRY_WITH for scanned tags against the owner's closet and week."""
        result = get_engine().judge(body.owner, body.tags, body.location)
        return JudgeOut(verdict=result.verdict, week=result.week, pipeline=result.pipeline)

    @app.get("/week/{owner}", response_model=WeekOut)
    def week(owner: str, lat: float | None = None, lon: float | None = None) -> WeekOut:
        """Return the forecast and calendar events for the coming days."""
        location = (
            Location(latitude=lat, longitude=lon) if lat is not None and lon is not None else None
        )
        result = get_engine().week(owner, location)
        return WeekOut(week=result.week, pipeline=result.pipeline)

    @app.post("/render", response_model=RenderOut)
    def render(
        person: Annotated[UploadFile, File(description="Person photo; held in memory only")],
        garment: Annotated[UploadFile, File(description="Garment photo or cutout")],
        region: Annotated[TryOnRegion, Form()],
        seed: Annotated[int | None, Form()] = None,
    ) -> RenderOut:
        """Render the garment on the person."""
        result = get_engine().render(person.file.read(), garment.file.read(), region, seed)
        return RenderOut(
            image_png_base64=_b64(result.image_png), cached=result.cached, pipeline=result.pipeline
        )

    @app.post("/chat", response_model=ChatOut)
    def chat(body: ChatIn) -> ChatOut:
        """Ask the stylist about the current scan, verdict or closet."""
        result = get_engine().chat(
            body.owner, body.message, body.history, body.candidate, body.verdict, body.location
        )
        return ChatOut(reply=result.reply, pipeline=result.pipeline)

    @app.get("/closet/{owner}", response_model=list[Garment])
    def closet(owner: str) -> list[Garment]:
        """List the owner's closet."""
        return get_engine().closet(owner)

    @app.post("/closet/{owner}", response_model=AddOut)
    def add_to_closet(
        owner: str,
        image: Annotated[UploadFile, File()],
        tags_json: Annotated[
            str | None, Form(description="GarmentTags as JSON; omit to auto-tag")
        ] = None,
        price: Annotated[Decimal | None, Form()] = None,
        source: Annotated[Source, Form()] = Source.CLOSET,
    ) -> AddOut:
        """Add a garment photo to the closet, tagging it unless `tags_json` is given."""
        tags = _parse_tags(tags_json) if tags_json else None
        result = get_engine().add_to_closet(
            owner, image.file.read(), tags=tags, price=price, source=source
        )
        return AddOut(garment=result.garment, pipeline=result.pipeline)

    @app.get("/closet/{owner}/{garment_id}/image", response_class=Response)
    def garment_image(owner: str, garment_id: str) -> Response:
        """Return the stored garment cutout as PNG."""
        return Response(get_engine().garment_image(owner, garment_id), media_type="image/png")

    @app.delete("/closet/{owner}", response_model=ForgetOut)
    def forget(owner: str) -> ForgetOut:
        """Delete every garment and stored image for the owner."""
        return ForgetOut(deleted=get_engine().forget(owner))

    return app


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _parse_tags(raw: str) -> GarmentTags:
    try:
        return GarmentTags.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise InvalidInput(f"tags_json is not valid `GarmentTags` JSON: {exc}") from exc
