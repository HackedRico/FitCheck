from __future__ import annotations

from datetime import date, time
from types import ModuleType

import pytest

from fitcheck.context import calendar_fixture, calendar_none
from fitcheck.context.calendar_fixture import FixtureCalendar
from fitcheck.context.calendar_none import NoCalendar
from fitcheck.domain import RunsOn
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings

# =============================================================================
# Module Overview
# =============================================================================
# Tests for the offline calendar sources: `NoCalendar` returns nothing, and
# `FixtureCalendar` places its three demo plans relative to the week's start.

START = date(2026, 10, 5)


def test_no_calendar_returns_no_events() -> None:
    assert NoCalendar().upcoming("maya", START, 7) == []


def test_no_calendar_rejects_zero_days() -> None:
    with pytest.raises(InvalidInput):
        NoCalendar().upcoming("maya", START, 0)


def test_fixture_places_three_plans_relative_to_start() -> None:
    events = FixtureCalendar().upcoming("maya", START, 7)

    rows = [(e.title, e.start.date(), e.start.time(), e.formality) for e in events]
    assert rows == [
        ("Climbing gym", date(2026, 10, 5), time(18, 0), 1),
        ("Team dinner", date(2026, 10, 7), time(19, 30), 3),
        ("Job interview", date(2026, 10, 9), time(10, 0), 4),
    ]


def test_fixture_times_are_timezone_aware() -> None:
    events = FixtureCalendar().upcoming("maya", START, 7)

    assert all(e.start.tzinfo is not None for e in events)


@pytest.mark.parametrize(
    ("days", "titles"),
    [
        (1, ["Climbing gym"]),
        (3, ["Climbing gym", "Team dinner"]),
        (4, ["Climbing gym", "Team dinner"]),
        (5, ["Climbing gym", "Team dinner", "Job interview"]),
    ],
)
def test_fixture_keeps_only_plans_inside_the_window(days: int, titles: list[str]) -> None:
    events = FixtureCalendar().upcoming("maya", START, days)

    assert [e.title for e in events] == titles


def test_fixture_rejects_zero_days() -> None:
    with pytest.raises(InvalidInput):
        FixtureCalendar().upcoming("maya", START, 0)


@pytest.mark.parametrize("module", [calendar_none, calendar_fixture])
def test_offline_calendars_run_on_this_machine(module: ModuleType) -> None:
    source = module.build(Settings())

    assert source.info.runs_on == RunsOn.THIS_MACHINE
