from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from typing import Protocol

from fitcheck.domain import (
    AdapterInfo,
    CalendarEvent,
    ChatTurn,
    Forecast,
    FoundGarment,
    Garment,
    GarmentTags,
    Location,
    StylistBrief,
    StylistReply,
    TryOnRequest,
    TryOnResult,
)

# =============================================================================
# Module Overview
# =============================================================================
# The seams of the engine. Each `Protocol` here is one slot that `wiring` fills with
# an adapter picked by an env var, so a teammate can swap Postgres for Snowflake or
# the fake tagger for Qwen3-VL without touching a caller. Every adapter exposes
# `info` so the pipeline panel can show what ran where.


class _Described(Protocol):
    @property
    def info(self) -> AdapterInfo:
        """Name, model, license and location of this adapter, for the pipeline panel."""
        ...


class ClosetStore(_Described, Protocol):
    """Garment records per owner. Holds garment data only, never a person photo."""

    def garments(self, owner: str) -> list[Garment]:
        """Return every garment `owner` has, oldest first."""
        ...

    def get(self, owner: str, garment_id: str) -> Garment | None:
        """Return one garment, or `None` if `owner` has no garment with that id."""
        ...

    def save(self, garment: Garment) -> None:
        """Insert or replace `garment`, keyed by its `id`."""
        ...

    def search(self, owner: str, query: str, limit: int = 8) -> list[Garment]:
        """Return up to `limit` of `owner`'s garments ranked by relevance to free-text `query`."""
        ...

    def forget(self, owner: str) -> int:
        """Delete everything stored for `owner` and return how many garments went."""
        ...


class GarmentTagger(_Described, Protocol):
    def tag(self, image_png: bytes) -> GarmentTags:
        """Read the garment in `image_png`; raise `TaggingFailed` on unusable model output."""
        ...

    def find_all(self, image_png: bytes) -> list[FoundGarment]:
        """Find every separate garment in a photo of a rack, pile or closet, with tags and box."""
        ...


class GarmentCutter(_Described, Protocol):
    def cut(self, image: bytes) -> bytes:
        """Return a PNG of the garment with hanger and background made transparent."""
        ...


class TryOnRenderer(_Described, Protocol):
    def render(self, request: TryOnRequest) -> TryOnResult:
        """Paint the garment onto the person; hold the person photo in memory only."""
        ...


class WeatherSource(_Described, Protocol):
    def forecast(self, location: Location, days: int) -> Forecast:
        """Return a daily forecast for `days` days starting today at `location`."""
        ...


class CalendarSource(_Described, Protocol):
    def upcoming(self, owner: str, start: date, days: int) -> list[CalendarEvent]:
        """Return `owner`'s events from `start` for `days` days, with `formality` inferred."""
        ...


class Stylist(_Described, Protocol):
    def reply(self, brief: StylistBrief, history: Sequence[ChatTurn], message: str) -> StylistReply:
        """Answer `message` using only the facts in `brief`; state the verdict, never change it."""
        ...
