from __future__ import annotations

from datetime import date

from fitcheck.domain import AdapterInfo, CalendarEvent, RunsOn
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings

# =============================================================================
# Module Overview
# =============================================================================
# `NoCalendar` reports an empty week of plans, for owners who connect no calendar.
# Verdicts then weigh only the closet and the weather.


class NoCalendar:
    """Calendar source that always returns no events."""

    info = AdapterInfo(name="no-calendar", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

    def upcoming(self, owner: str, start: date, days: int) -> list[CalendarEvent]:
        """Return no events."""
        if days < 1:
            raise InvalidInput("days must be at least 1")
        return []


def build(settings: Settings) -> NoCalendar:
    """Return the empty calendar source."""
    return NoCalendar()
