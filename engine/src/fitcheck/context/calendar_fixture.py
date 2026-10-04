from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fitcheck.context.occasions import infer_formality
from fitcheck.domain import AdapterInfo, CalendarEvent, RunsOn
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings

# (day, local start time, title); day 1 is `start`. The demo verdicts depend on these.
_PLANS: tuple[tuple[int, time, str], ...] = (
    (1, time(18, 0), "Climbing gym"),
    (3, time(19, 30), "Team dinner"),
    (5, time(10, 0), "Job interview"),
)

# =============================================================================
# Module Overview
# =============================================================================
# `FixtureCalendar` serves the same three plans for every owner, placed relative to
# the week's start: a climbing session, a team dinner and a job interview. Dress codes
# come from `infer_formality`, as they do for a real calendar.


class FixtureCalendar:
    """Deterministic offline calendar for demos and tests."""

    info = AdapterInfo(name="calendar-fixture", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

    def upcoming(self, owner: str, start: date, days: int) -> list[CalendarEvent]:
        """Return the fixture plans that fall within `days` days from `start`."""
        if days < 1:
            raise InvalidInput("days must be at least 1")
        return [
            CalendarEvent(
                title=title,
                start=_local(start + timedelta(days=day - 1), at),
                formality=infer_formality(title),
            )
            for day, at, title in _PLANS
            if day <= days
        ]


def _local(day: date, at: time) -> datetime:
    """Return `day` at `at` in this machine's timezone, aware like real calendar times."""
    return datetime.combine(day, at).astimezone()


def build(settings: Settings) -> FixtureCalendar:
    """Return the fixture calendar source; it needs no settings."""
    return FixtureCalendar()
