from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

# =============================================================================
# Module Overview
# =============================================================================
# The shared vocabulary of FitCheck as immutable values, with no I/O. `GarmentTags`
# is what a tagger reads off one image, `Garment` is a tagged item in a closet,
# `WeekContext` bundles the `Forecast` and `CalendarEvent`s, and `Verdict` answers
# "should I buy this?". Every module and adapter speaks in these types.

Score = Annotated[int, Field(ge=1, le=5)]


class _Value(BaseModel):
    """Base for every domain value: immutable, and unknown fields are an error."""

    model_config = ConfigDict(frozen=True, extra="forbid")


# =============================================================================
# Garments
# =============================================================================


class Category(StrEnum):
    TOP = "top"
    SWEATER = "sweater"
    SHIRT = "shirt"
    OUTERWEAR = "outerwear"
    DRESS = "dress"
    BOTTOM = "bottom"
    SHOES = "shoes"
    ACCESSORY = "accessory"


class ColorFamily(StrEnum):
    BLACK = "black"
    WHITE = "white"
    GREY = "grey"
    NAVY = "navy"
    BLUE = "blue"
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"
    PINK = "pink"
    BROWN = "brown"
    BEIGE = "beige"
    MULTI = "multi"


class Pattern(StrEnum):
    SOLID = "solid"
    STRIPE = "stripe"
    CHECK = "check"
    FLORAL = "floral"
    GRAPHIC = "graphic"
    OTHER = "other"


class Source(StrEnum):
    """Where a garment record came from."""

    CLOSET = "closet"
    STORE = "store"
    ONLINE = "online"


class GarmentTags(_Value):
    """What a tagger reads off one garment image; the verdict rules see only this."""

    category: Category
    color_family: ColorFamily
    pattern: Pattern
    # 1 = summer tee, 5 = winter parka
    warmth: Score
    waterproof: bool
    # 1 = gym, 5 = black tie
    formality: Score
    description: Annotated[str, Field(max_length=120)]


class Garment(_Value):
    """A tagged garment that belongs to one owner's closet."""

    id: str
    owner: str
    source: Source = Source.CLOSET
    tags: GarmentTags
    price: Decimal | None = None
    wears: Annotated[int, Field(ge=0)] = 0
    # Key into the engine's garment image folder, never a person photo
    image_ref: str | None = None
    # The shop or image link the garment was imported from, so the owner can go back to it
    source_url: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Box(_Value):
    """A rectangle in an image as fractions of its width and height, top-left origin."""

    left: Annotated[float, Field(ge=0, le=1)]
    top: Annotated[float, Field(ge=0, le=1)]
    right: Annotated[float, Field(ge=0, le=1)]
    bottom: Annotated[float, Field(ge=0, le=1)]


class FoundGarment(_Value):
    """One garment a tagger found in a photo of several, with where it is."""

    tags: GarmentTags
    box: Box


class TryOnRegion(StrEnum):
    """The body region a try-on model repaints."""

    UPPER = "upper"
    LOWER = "lower"
    FULL = "full"


# =============================================================================
# Week context: weather and calendar
# =============================================================================


class Location(_Value):
    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]
    name: str | None = None


class DayForecast(_Value):
    day: date
    temp_min_c: float
    temp_max_c: float
    precipitation_mm: Annotated[float, Field(ge=0)]
    precipitation_probability: Annotated[int, Field(ge=0, le=100)] | None = None
    # WMO weather interpretation code, as Open-Meteo reports it
    weather_code: int | None = None


class Forecast(_Value):
    location: Location
    days: tuple[DayForecast, ...]
    # Open-Meteo's CC BY 4.0 data license requires this line wherever forecasts show
    attribution: str = "Weather data by Open-Meteo.com"


class CalendarEvent(_Value):
    title: str
    start: datetime
    end: datetime | None = None
    location: str | None = None
    # Inferred dress code, 1 = gym, 5 = black tie; `None` when the title gives no hint
    formality: Score | None = None


class WeekContext(_Value):
    """The next days of weather and plans that a verdict weighs."""

    forecast: Forecast | None = None
    events: tuple[CalendarEvent, ...] = ()


# =============================================================================
# Verdict
# =============================================================================


class Decision(StrEnum):
    BUY = "buy"
    SKIP = "skip"
    TRY_WITH = "try_with"


class ReasonCode(StrEnum):
    DUPLICATES = "duplicates"
    FILLS_WEATHER_GAP = "fills_weather_gap"
    FITS_EVENT = "fits_event"
    # A loud print or mixed colors: pairs on paper, but needs seeing on before a BUY
    STATEMENT_PIECE = "statement_piece"
    PAIRS_WELL = "pairs_well"
    FEW_PAIRINGS = "few_pairings"


class Reason(_Value):
    code: ReasonCode
    message: str
    garment_ids: tuple[str, ...] = ()


class Verdict(_Value):
    """The rules' answer for one candidate garment; the stylist explains it, never changes it."""

    decision: Decision
    headline: str
    reasons: tuple[Reason, ...]
    duplicates: tuple[Garment, ...] = ()
    pairings: tuple[Garment, ...] = ()
    best_pairing: Garment | None = None


# =============================================================================
# Try-on and stylist exchange values
# =============================================================================


class TryOnRequest(_Value):
    # Person photo bytes stay in memory; no adapter may write them anywhere
    person_image: bytes
    garment_image: bytes
    region: TryOnRegion
    seed: int | None = None


class TryOnResult(_Value):
    image_png: bytes
    # True when a fallback served a pre-computed render; the UI must label it "cached"
    cached: bool = False
    # True when the image is a stand-in, not a model's try-on: a backup renderer stood in, or
    # the plain overlay drew it; the web app then builds its own on-device preview instead
    fallback: bool = False


class ChatTurn(_Value):
    role: Literal["user", "stylist"]
    text: str


class StylistBrief(_Value):
    """Every fact the stylist may use; it must not invent anything beyond these."""

    candidate: GarmentTags | None = None
    verdict: Verdict | None = None
    closet_matches: tuple[Garment, ...] = ()
    week: WeekContext | None = None


class RenderAction(_Value):
    """A stylist request to render the candidate together with these closet garments."""

    garment_ids: tuple[str, ...]


class StylistReply(_Value):
    text: str
    render: RenderAction | None = None


# =============================================================================
# Provenance: what ran where
# =============================================================================


class RunsOn(StrEnum):
    """Where an adapter executes; the pipeline panel and the privacy badge read this."""

    THIS_MACHINE = "this_machine"
    SELF_HOSTED_GPU = "self_hosted_gpu"
    SNOWFLAKE = "snowflake"
    PUBLIC_API = "public_api"


class AdapterInfo(_Value):
    name: str
    model: str | None = None
    license: str | None = None
    runs_on: RunsOn = RunsOn.THIS_MACHINE


class PipelineStep(_Value):
    step: str
    adapter: AdapterInfo
    ms: int
    touched_person_image: bool = False
    # True when the step failed and the engine continued without it
    skipped: bool = False
    cached: bool = False


Pipeline = tuple[PipelineStep, ...]
