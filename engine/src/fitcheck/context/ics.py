from __future__ import annotations

import time
from collections.abc import Callable
from datetime import date, datetime, timedelta, tzinfo
from datetime import time as clock_time
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from pydantic import SecretStr

from fitcheck.context.occasions import infer_formality
from fitcheck.domain import AdapterInfo, CalendarEvent, RunsOn
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings

if TYPE_CHECKING:
    from icalendar import Calendar, Component

CACHE_TTL_S = 5 * 60
TIMEOUT_S = 10.0
ENV_VAR = "FITCHECK_CALENDAR_ICS_URL"
_LICENSE = "icalendar BSD-2-Clause, recurring-ical-events LGPL-3.0-or-later"
_UNTITLED = "Untitled event"

# =============================================================================
# Module Overview
# =============================================================================
# `IcsCalendar` reads one iCalendar feed, such as a Google Calendar secret iCal
# address or a local .ics file, and serves it for every owner. It expands recurring
# events over the requested week, turns all-day dates into aware datetimes and fills
# each occasion's dress code. The parsed feed is cached for 5 minutes. The address is
# a credential, so it never appears in a log or an error message.


class IcsCalendar:
    """Calendar source backed by one iCalendar feed over https or from a file."""

    def __init__(
        self,
        source: SecretStr,
        *,
        timeout_s: float = TIMEOUT_S,
        cache_ttl_s: float = CACHE_TTL_S,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        _require_calendar_extra()
        raw = source.get_secret_value().strip()
        if not raw:
            raise AdapterUnavailable(f"`{ENV_VAR}` is empty; set it to an iCal address or path.")
        scheme = raw.split("://", 1)[0].lower() if "://" in raw else ""
        if scheme == "http":
            raise AdapterUnavailable(
                f"`{ENV_VAR}` must use https; a secret iCal address sent over http can be read."
            )
        if scheme not in ("", "https", "webcal"):
            raise AdapterUnavailable(f"`{ENV_VAR}` must be an https address or a file path.")
        self._remote = scheme in ("https", "webcal")
        # Apple and Outlook hand out webcal:// links; they are plain https underneath
        address = "https://" + raw.split("://", 1)[1] if scheme == "webcal" else raw
        self._source = SecretStr(address)
        self._timeout_s = timeout_s
        self._cache_ttl_s = cache_ttl_s
        self._clock = clock
        # (fetched at, parsed feed); FastAPI runs sync routes on a thread pool
        self._cached: tuple[float, Calendar] | None = None
        self._lock = Lock()
        self.info = AdapterInfo(
            name="ics-calendar",
            license=_LICENSE,
            # A remote feed means a request to the calendar host; a local file never leaves
            runs_on=RunsOn.PUBLIC_API if self._remote else RunsOn.THIS_MACHINE,
        )

    def upcoming(self, owner: str, start: date, days: int) -> list[CalendarEvent]:
        """Return the feed's events from `start` for `days` days, earliest first."""
        if days < 1:
            raise InvalidInput("days must be at least 1")
        import recurring_ical_events

        calendar = self._calendar()
        zone = _calendar_zone(calendar)
        try:
            # One broken recurring series should not hide the rest of the week
            query = recurring_ical_events.of(calendar, skip_bad_series=True)
            occurrences = query.between(start, start + timedelta(days=days))
        except ValueError as exc:
            raise AdapterUnavailable(f"The calendar in `{ENV_VAR}` could not be expanded.") from exc
        events = [_to_event(c, zone) for c in occurrences if not _cancelled(c)]
        return sorted((e for e in events if e is not None), key=lambda event: event.start)

    # -----------------------------------------------------------------
    # Fetch, parse and cache
    # -----------------------------------------------------------------

    def _calendar(self) -> Calendar:
        """Return the parsed feed, fetching it again once the cached copy is stale."""
        with self._lock:
            cached = self._cached
        if cached is not None and self._clock() - cached[0] < self._cache_ttl_s:
            return cached[1]
        calendar = _parse(self._read())
        with self._lock:
            self._cached = (self._clock(), calendar)
        return calendar

    def _read(self) -> bytes:
        """Return the raw feed from the https address or the local file."""
        source = self._source.get_secret_value()
        if not self._remote:
            try:
                return Path(source).expanduser().read_bytes()
            except OSError as exc:
                raise AdapterUnavailable(f"Cannot read the .ics file in `{ENV_VAR}`.") from exc
        # `from None` below: httpx errors quote the URL, and this URL is a credential
        try:
            response = httpx.get(source, timeout=self._timeout_s, follow_redirects=True)
        except httpx.TimeoutException:
            raise AdapterUnavailable(
                f"The calendar in `{ENV_VAR}` did not answer within {self._timeout_s:g} s."
            ) from None
        except httpx.HTTPError as exc:
            raise AdapterUnavailable(
                f"The calendar in `{ENV_VAR}` is unreachable ({type(exc).__name__})."
            ) from None
        if response.is_error:
            raise AdapterUnavailable(
                f"The calendar in `{ENV_VAR}` answered HTTP {response.status_code}; "
                "check the secret address is still current."
            )
        return response.content


# =============================================================================
# Helpers
# =============================================================================


def _require_calendar_extra() -> None:
    """Raise `AdapterUnavailable` unless the optional `calendar` extra is installed."""
    try:
        import icalendar  # noqa: F401
        import recurring_ical_events  # noqa: F401
    except ImportError as exc:
        raise AdapterUnavailable(
            "The ics calendar needs the `calendar` extra; run `uv sync --all-extras`."
        ) from exc


def _parse(data: bytes) -> Calendar:
    """Parse `data` as one VCALENDAR; bytes are never mistaken for a file path."""
    from icalendar import Calendar

    try:
        parsed = Calendar.from_ical(data)
    except ValueError as exc:
        raise AdapterUnavailable(
            f"The calendar in `{ENV_VAR}` is not a valid iCalendar file."
        ) from exc
    if not isinstance(parsed, Calendar):
        raise AdapterUnavailable(f"The calendar in `{ENV_VAR}` holds no VCALENDAR.")
    return parsed


def _calendar_zone(calendar: Calendar) -> tzinfo | None:
    """Return the feed's own timezone from `X-WR-TIMEZONE`, which Google sets, or `None`."""
    name = calendar.get("X-WR-TIMEZONE")
    if not name:
        return None
    try:
        return ZoneInfo(str(name))
    except (ZoneInfoNotFoundError, ValueError):
        return None


def _cancelled(component: Component) -> bool:
    # Google exports a cancelled instance of a series as an override with this status
    return str(component.get("STATUS", "")).upper() == "CANCELLED"


def _to_event(component: Component, zone: tzinfo | None) -> CalendarEvent | None:
    """Convert one occurrence, or return `None` when it has no usable start."""
    start = component.decoded("DTSTART", None)
    if not isinstance(start, date):
        return None
    end = component.decoded("DTEND", None)
    title = str(component.get("SUMMARY", "")).strip() or _UNTITLED
    return CalendarEvent(
        title=title,
        start=_as_datetime(start, zone),
        end=_as_datetime(end, zone) if isinstance(end, date) else None,
        location=str(component.get("LOCATION", "")).strip() or None,
        formality=infer_formality(title),
    )


def _as_datetime(value: date | datetime, zone: tzinfo | None) -> datetime:
    """Return `value` as an aware datetime; an all-day date starts at midnight."""
    # `datetime` subclasses `date`, so test for it first
    moment = value if isinstance(value, datetime) else datetime.combine(value, clock_time.min)
    if moment.tzinfo is not None:
        return moment
    # Floating and all-day times belong to the feed's zone, else to this machine's
    return moment.replace(tzinfo=zone) if zone is not None else moment.astimezone()


def build(settings: Settings) -> IcsCalendar:
    """Return a calendar source for `FITCHECK_CALENDAR_ICS_URL`, or raise if it is unset."""
    if settings.calendar_ics_url is None:
        raise AdapterUnavailable(
            f"The ics calendar needs `{ENV_VAR}`: a secret iCal address or an .ics file path."
        )
    return IcsCalendar(settings.calendar_ics_url)
