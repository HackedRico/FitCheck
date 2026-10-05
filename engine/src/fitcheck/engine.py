from __future__ import annotations

import io
import logging
import re
import shutil
import uuid
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from time import perf_counter
from typing import TypeVar
from urllib.parse import urlsplit

from PIL import Image
from pydantic import BaseModel, ConfigDict

from fitcheck import verdict as verdict_rules
from fitcheck.domain import (
    AdapterInfo,
    Box,
    ChatTurn,
    Garment,
    GarmentTags,
    Location,
    Pipeline,
    PipelineStep,
    RenderAction,
    RunsOn,
    Source,
    StylistBrief,
    StylistReply,
    TryOnRegion,
    TryOnRequest,
    Verdict,
    WeekContext,
)
from fitcheck.errors import InvalidInput, NotFound
from fitcheck.garment_link import LinkedGarment, fetch_garment
from fitcheck.ports import (
    CalendarSource,
    ClosetStore,
    GarmentCutter,
    GarmentTagger,
    Stylist,
    TryOnRenderer,
    WeatherSource,
)
from fitcheck.vision import images

T = TypeVar("T")

log = logging.getLogger(__name__)

RULES_INFO = AdapterInfo(name="verdict-rules", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)
LINK_INFO = AdapterInfo(name="link-import", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

# Owners name folders on disk, so keep them to a safe slug
_OWNER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_SEED_PREFIX = "seed/"
# Matches the `/link` request cap, so any link the app imported can also be stored
_MAX_LINK_CHARS = 2048
# Magic numbers for the image formats phones and browsers send
_IMAGE_SIGNATURES = (b"\x89PNG", b"\xff\xd8\xff", b"RIFF", b"GIF8")

# =============================================================================
# Module Overview
# =============================================================================
# The engine: every FitCheck capability behind one small interface. `Engine` takes
# a `Ports` bundle of adapters and offers `scan`, `judge`, `render`, `chat` and the
# closet operations; each result carries the `Pipeline` of steps that ran, so the UI
# can show what ran where. Person photos pass through `render` in memory and nowhere else.


# =============================================================================
# Results
# =============================================================================


class _Result(BaseModel):
    model_config = ConfigDict(frozen=True)


class ScanResult(_Result):
    tags: GarmentTags
    cutout_png: bytes
    pipeline: Pipeline


class WeekResult(_Result):
    week: WeekContext
    pipeline: Pipeline


class Judgement(_Result):
    verdict: Verdict
    week: WeekContext
    pipeline: Pipeline


class RenderResult(_Result):
    image_png: bytes
    cached: bool
    fallback: bool
    pipeline: Pipeline


class ChatResult(_Result):
    reply: StylistReply
    pipeline: Pipeline


class LinkResult(_Result):
    image_png: bytes
    source_url: str
    title: str | None
    pipeline: Pipeline


class AddResult(_Result):
    garment: Garment
    pipeline: Pipeline


class ClosetScanResult(_Result):
    garments: tuple[Garment, ...]
    pipeline: Pipeline


# =============================================================================
# Engine
# =============================================================================


@dataclass(frozen=True)
class Ports:
    """One adapter per seam, as `wiring.build_engine` picks them from settings."""

    store: ClosetStore
    tagger: GarmentTagger
    cutter: GarmentCutter
    renderer: TryOnRenderer
    weather: WeatherSource
    calendar: CalendarSource
    stylist: Stylist


class Engine:
    """Scan, judge, render and chat over one owner's closet and week."""

    def __init__(
        self,
        ports: Ports,
        *,
        data_dir: Path,
        default_location: Location,
        forecast_days: int = 7,
        seed_images_dir: Path | None = None,
        today: Callable[[], date] = date.today,
        fetch_link: Callable[[str], LinkedGarment] = fetch_garment,
    ) -> None:
        if forecast_days < 1:
            raise ValueError("forecast_days must be at least 1")
        self._ports = ports
        self._images_dir = data_dir / "garments"
        self._seed_images_dir = seed_images_dir
        self._default_location = default_location
        self._forecast_days = forecast_days
        self._today = today
        self._fetch_link = fetch_link

    @property
    def ports(self) -> Ports:
        """The adapters this engine runs on."""
        return self._ports

    def adapters(self) -> dict[str, AdapterInfo]:
        """Describe the adapter in every slot, for `/health` and the pipeline panel."""
        p = self._ports
        return {
            "store": p.store.info,
            "tagger": p.tagger.info,
            "cutout": p.cutter.info,
            "tryon": p.renderer.info,
            "weather": p.weather.info,
            "calendar": p.calendar.info,
            "stylist": p.stylist.info,
            "verdict": RULES_INFO,
        }

    # -----------------------------------------------------------------
    # Scan and judge
    # -----------------------------------------------------------------

    def scan(self, image: bytes) -> ScanResult:
        """Cut the garment out of `image` and tag it. Nothing is stored."""
        _require_image(image, "image")
        trace = _Trace()
        with trace.step("cutout", self._ports.cutter.info):
            cutout = self._ports.cutter.cut(image)
        with trace.step("tag", self._ports.tagger.info):
            tags = self._ports.tagger.tag(cutout)
        return ScanResult(tags=tags, cutout_png=cutout, pipeline=trace.pipeline)

    def import_link(self, url: str) -> LinkResult:
        """Fetch the garment image behind a shop or image link, for a garment not owned yet."""
        if not url.strip():
            raise InvalidInput("url must not be empty")
        trace = _Trace()
        with trace.step("link", LINK_INFO):
            linked = self._fetch_link(url.strip())
        return LinkResult(
            image_png=linked.image_png,
            source_url=linked.source_url,
            title=linked.title,
            pipeline=trace.pipeline,
        )

    def week(self, owner: str, location: Location | None = None) -> WeekResult:
        """Return the forecast and calendar for the coming days; a failing source is skipped."""
        _require_owner(owner)
        trace = _Trace()
        week = self._gather_week(owner, location, trace)
        return WeekResult(week=week, pipeline=trace.pipeline)

    def judge(
        self, owner: str, candidate: GarmentTags, location: Location | None = None
    ) -> Judgement:
        """Decide BUY, SKIP or TRY_WITH for `candidate` against `owner`'s closet and week."""
        _require_owner(owner)
        trace = _Trace()
        with trace.step("closet", self._ports.store.info):
            closet = self._ports.store.garments(owner)
        week = self._gather_week(owner, location, trace)
        with trace.step("verdict", RULES_INFO):
            verdict = verdict_rules.decide(candidate, closet, week, self._today())
        return Judgement(verdict=verdict, week=week, pipeline=trace.pipeline)

    # -----------------------------------------------------------------
    # Try-on and stylist
    # -----------------------------------------------------------------

    def render(
        self,
        person_image: bytes,
        garment_image: bytes,
        region: TryOnRegion,
        seed: int | None = None,
    ) -> RenderResult:
        """Paint the garment onto the person. The person photo is never written anywhere."""
        _require_image(person_image, "person_image")
        _require_image(garment_image, "garment_image")
        trace = _Trace()
        request = TryOnRequest(
            person_image=person_image, garment_image=garment_image, region=region, seed=seed
        )
        with trace.step("render", self._ports.renderer.info, touched_person_image=True) as mark:
            result = self._ports.renderer.render(request)
            mark.cached = result.cached
        image_png = _match_shape(result.image_png, person_image)
        return RenderResult(
            image_png=image_png,
            cached=result.cached,
            fallback=result.fallback,
            pipeline=trace.pipeline,
        )

    def chat(
        self,
        owner: str,
        message: str,
        history: Sequence[ChatTurn] = (),
        candidate: GarmentTags | None = None,
        verdict: Verdict | None = None,
        location: Location | None = None,
    ) -> ChatResult:
        """Answer `message` from the stylist, grounded in closet search results and the week."""
        _require_owner(owner)
        if not message.strip():
            raise InvalidInput("message must not be empty")
        trace = _Trace()
        with trace.step("closet_search", self._ports.store.info):
            matches = self._ports.store.search(owner, message)
        week = self._gather_week(owner, location, trace)
        if candidate is not None and verdict is None:
            # Without the rules' verdict a model invents its own and contradicts BUY or SKIP
            with trace.step("verdict", RULES_INFO):
                closet = self._ports.store.garments(owner)
                verdict = verdict_rules.decide(candidate, closet, week, self._today())
        brief = StylistBrief(
            candidate=candidate, verdict=verdict, closet_matches=tuple(matches), week=week
        )
        with trace.step("chat", self._ports.stylist.info):
            reply = self._ports.stylist.reply(brief, history, message)
        reply = self._drop_invented_garments(owner, reply)
        return ChatResult(reply=reply, pipeline=trace.pipeline)

    # -----------------------------------------------------------------
    # Closet
    # -----------------------------------------------------------------

    def closet(self, owner: str) -> list[Garment]:
        """Return every garment in `owner`'s closet."""
        _require_owner(owner)
        return self._ports.store.garments(owner)

    def add_to_closet(
        self,
        owner: str,
        image: bytes,
        *,
        tags: GarmentTags | None = None,
        price: Decimal | None = None,
        source: Source = Source.CLOSET,
        source_url: str | None = None,
    ) -> AddResult:
        """Cut out, tag (unless `tags` is given), store the image and save a new garment."""
        _require_owner(owner)
        _require_image(image, "image")
        if price is not None and (not price.is_finite() or price < 0):
            raise InvalidInput("price must be a finite amount of zero or more")
        if source_url is not None:
            _require_web_link(source_url)
        trace = _Trace()
        with trace.step("cutout", self._ports.cutter.info):
            cutout = self._ports.cutter.cut(image)
        if tags is None:
            with trace.step("tag", self._ports.tagger.info):
                tags = self._ports.tagger.tag(cutout)
        garment_id = uuid.uuid4().hex[:12]
        image_ref = f"{owner}/{garment_id}.png"
        path = self._images_dir / image_ref
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(cutout)
        garment = Garment(
            id=garment_id,
            owner=owner,
            source=source,
            tags=tags,
            price=price,
            image_ref=image_ref,
            source_url=source_url,
        )
        with trace.step("closet", self._ports.store.info):
            self._ports.store.save(garment)
        return AddResult(garment=garment, pipeline=trace.pipeline)

    def scan_closet(self, owner: str, image: bytes) -> ClosetScanResult:
        """Find every garment in a rack or closet photo and add each to `owner`'s closet."""
        _require_owner(owner)
        _require_image(image, "image")
        trace = _Trace()
        with trace.step("find_garments", self._ports.tagger.info):
            found = self._ports.tagger.find_all(image)
        added: list[Garment] = []
        steps = list(trace.pipeline)
        for item in found:
            crop = _crop(image, item.box)
            result = self.add_to_closet(owner, crop, tags=item.tags)
            added.append(result.garment)
            steps.extend(result.pipeline)
        return ClosetScanResult(garments=tuple(added), pipeline=tuple(steps))

    def garment_image(self, owner: str, garment_id: str) -> bytes:
        """Return the stored PNG for one garment, or raise `NotFound`."""
        _require_owner(owner)
        garment = self._ports.store.get(owner, garment_id)
        if garment is None or garment.image_ref is None:
            raise NotFound(f"No image for garment `{garment_id}` in `{owner}`'s closet.")
        path = self._resolve_image(garment.image_ref)
        if path is None or not path.is_file():
            raise NotFound(f"Image file for garment `{garment_id}` is missing.")
        return path.read_bytes()

    def forget(self, owner: str) -> int:
        """Delete every garment record and stored image for `owner`; return the record count."""
        _require_owner(owner)
        removed = self._ports.store.forget(owner)
        shutil.rmtree(self._images_dir / owner, ignore_errors=True)
        return removed

    # -----------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------

    def _gather_week(self, owner: str, location: Location | None, trace: _Trace) -> WeekContext:
        """Fetch weather and calendar; either one may fail without blocking a verdict."""
        location = location or self._default_location
        days = self._forecast_days
        forecast = trace.attempt(
            "weather",
            self._ports.weather.info,
            lambda: self._ports.weather.forecast(location, days),
        )
        events = trace.attempt(
            "calendar",
            self._ports.calendar.info,
            lambda: self._ports.calendar.upcoming(owner, self._today(), days),
        )
        return WeekContext(forecast=forecast, events=tuple(events or ()))

    def _drop_invented_garments(self, owner: str, reply: StylistReply) -> StylistReply:
        """Keep only render ids that exist in `owner`'s closet; models sometimes invent ids."""
        if reply.render is None:
            return reply
        known = [gid for gid in reply.render.garment_ids if self._ports.store.get(owner, gid)]
        if len(known) != len(reply.render.garment_ids):
            log.warning("[Engine] Stylist asked to render unknown garment ids; dropped them.")
        render = RenderAction(garment_ids=tuple(known)) if known else None
        return reply.model_copy(update={"render": render})

    def _resolve_image(self, image_ref: str) -> Path | None:
        """Map an `image_ref` to a file under the image folders, or `None` if it escapes them."""
        if image_ref.startswith(_SEED_PREFIX):
            if self._seed_images_dir is None:
                return None
            root = self._seed_images_dir.resolve()
            path = (root / image_ref.removeprefix(_SEED_PREFIX)).resolve()
        else:
            root = self._images_dir.resolve()
            path = (root / image_ref).resolve()
        # A crafted ref like `../../etc/passwd` must not read outside the image folders
        return path if path.is_relative_to(root) else None


# =============================================================================
# Pipeline tracing
# =============================================================================


@dataclass
class _StepMark:
    """Mutable flags a step body can set before the step is recorded."""

    cached: bool = False


class _Trace:
    """Collects `PipelineStep`s with timings as the engine runs adapters."""

    def __init__(self) -> None:
        self._steps: list[PipelineStep] = []

    @property
    def pipeline(self) -> Pipeline:
        return tuple(self._steps)

    @contextmanager
    def step(
        self, name: str, info: AdapterInfo, *, touched_person_image: bool = False
    ) -> Iterator[_StepMark]:
        """Time the body and record it as one step; exceptions propagate unrecorded."""
        mark = _StepMark()
        start = perf_counter()
        yield mark
        self._steps.append(
            PipelineStep(
                step=name,
                adapter=info,
                ms=_elapsed_ms(start),
                touched_person_image=touched_person_image,
                cached=mark.cached,
            )
        )

    def attempt(self, name: str, info: AdapterInfo, call: Callable[[], T]) -> T | None:
        """Run an optional step; on any failure log it, record it as skipped, return `None`."""
        start = perf_counter()
        try:
            result = call()
        # Weather and calendar are context, not core: any failure there must not block a verdict
        except Exception as exc:
            log.warning(
                "[Engine] %s via %s failed; continuing without it. Reason: %s", name, info.name, exc
            )
            self._steps.append(
                PipelineStep(step=name, adapter=info, ms=_elapsed_ms(start), skipped=True)
            )
            return None
        self._steps.append(PipelineStep(step=name, adapter=info, ms=_elapsed_ms(start)))
        return result


def _match_shape(render_png: bytes, person_image: bytes) -> bytes:
    """Trim a renderer's padding and resize so the render matches the person photo exactly."""
    # Upright size, because renderers paint the photo after applying its EXIF rotation
    target = images.open_image(person_image).size
    with Image.open(io.BytesIO(render_png)) as render:
        if render.size == target:
            return render_png
        width, height = render.size
        want = target[0] / target[1]
        # Diffusion try-on fits the person into its own frame and pads the rest, centred;
        # cutting the centre back to the photo's shape removes exactly that padding
        if width / height > want:
            inner = round(height * want)
            box = ((width - inner) // 2, 0, (width - inner) // 2 + inner, height)
        else:
            inner = round(width / want)
            box = (0, (height - inner) // 2, width, (height - inner) // 2 + inner)
        out = io.BytesIO()
        render.crop(box).resize(target, Image.Resampling.LANCZOS).save(out, format="PNG")
    return out.getvalue()


def _crop(image: bytes, box: Box) -> bytes:
    """Cut `box` out of `image` with a small margin, as PNG, so each garment keeps its edges."""
    # Upright, because the tagger drew its boxes on the photo after its EXIF rotation
    source = images.open_image(image)
    width, height = source.size
    # A few percent of slack, because model boxes tend to clip sleeves and hems
    pad_x = (box.right - box.left) * width * 0.04
    pad_y = (box.bottom - box.top) * height * 0.04
    area = (
        max(0, round(box.left * width - pad_x)),
        max(0, round(box.top * height - pad_y)),
        min(width, round(box.right * width + pad_x)),
        min(height, round(box.bottom * height + pad_y)),
    )
    return images.encode_png(source.convert("RGBA").crop(area))


def _elapsed_ms(start: float) -> int:
    return round((perf_counter() - start) * 1000)


def _require_owner(owner: str) -> None:
    if not _OWNER_PATTERN.fullmatch(owner):
        raise InvalidInput(
            "owner must be 1-64 chars of lowercase letters, digits, `-` or `_`, "
            "starting with a letter or digit"
        )


def _require_web_link(url: str) -> None:
    # The web app shows this as a link, so a `javascript:` URL would run in the owner's page
    if len(url) > _MAX_LINK_CHARS or urlsplit(url).scheme not in ("http", "https"):
        raise InvalidInput(
            f"source_url must be an http(s) link of at most {_MAX_LINK_CHARS} characters"
        )


def _require_image(data: bytes, field: str) -> None:
    if not data:
        raise InvalidInput(f"{field} is empty; send a PNG, JPEG or WebP file.")
    if not data.startswith(_IMAGE_SIGNATURES):
        raise InvalidInput(f"{field} is not a PNG, JPEG, WebP or GIF image.")
