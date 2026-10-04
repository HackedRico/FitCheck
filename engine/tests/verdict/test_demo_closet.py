from __future__ import annotations

from datetime import date, datetime, time, timedelta
from pathlib import Path

import pytest

from fitcheck.domain import (
    CalendarEvent,
    Category,
    ColorFamily,
    DayForecast,
    Decision,
    Forecast,
    Garment,
    GarmentTags,
    Location,
    Pattern,
    ReasonCode,
    WeekContext,
)
from fitcheck.seed import load_seed
from fitcheck.verdict import decide

SEED_PATH = Path(__file__).resolve().parents[3] / "demo" / "closet.json"
TODAY = date(2026, 10, 5)

# =============================================================================
# Module Overview
# =============================================================================
# The stage script as a test: Ricky's seed closet in `demo/closet.json` against a copy
# of the default weather and calendar fixtures must give BUY for the raincoat, SKIP
# for the navy crewneck and TRY_WITH for the bold shirt. The week is mirrored here
# rather than imported, so a fixture change shows up as a failing demo, not a quiet one.


def _fixture_week() -> WeekContext:
    """Mirror `weather_fixture` and `calendar_fixture`: rain on days 2, 4 and 5."""
    # (low C, high C, rain mm, chance %), day 1 is today
    numbers = (
        (12.0, 19.0, 0.0, 5),
        (10.0, 15.0, 6.5, 85),
        (9.0, 17.0, 0.0, 15),
        (11.0, 16.0, 3.8, 70),
        (8.0, 14.0, 12.4, 90),
        (13.0, 20.0, 0.0, 10),
        (14.0, 18.0, 0.0, 20),
    )
    days = tuple(
        DayForecast(
            day=TODAY + timedelta(days=offset),
            temp_min_c=low,
            temp_max_c=high,
            precipitation_mm=mm,
            precipitation_probability=chance,
        )
        for offset, (low, high, mm, chance) in enumerate(numbers)
    )
    plans = ((0, time(18, 0), "Climbing gym", 1), (2, time(19, 30), "Team dinner", 3))
    plans += ((4, time(10, 0), "Job interview", 4),)
    events = tuple(
        CalendarEvent(
            title=title,
            start=datetime.combine(TODAY + timedelta(days=offset), at).astimezone(),
            formality=formality,
        )
        for offset, at, title, formality in plans
    )
    forecast = Forecast(location=Location(latitude=40.7128, longitude=-74.0060), days=days)
    return WeekContext(forecast=forecast, events=events)


@pytest.fixture(scope="module")
def closet() -> list[Garment]:
    """Return Ricky's seed closet."""
    return load_seed(SEED_PATH)


WEEK = _fixture_week()

RAINCOAT = GarmentTags(
    category=Category.OUTERWEAR,
    color_family=ColorFamily.YELLOW,
    pattern=Pattern.SOLID,
    warmth=3,
    waterproof=True,
    formality=2,
    description="yellow hooded raincoat",
)
NAVY_CREWNECK = GarmentTags(
    category=Category.SWEATER,
    color_family=ColorFamily.NAVY,
    pattern=Pattern.SOLID,
    warmth=3,
    waterproof=False,
    formality=2,
    description="navy cotton crewneck",
)
BOLD_SHIRT = GarmentTags(
    category=Category.SHIRT,
    color_family=ColorFamily.MULTI,
    pattern=Pattern.FLORAL,
    warmth=2,
    waterproof=False,
    formality=3,
    description="bold floral camp-collar shirt",
)


def test_the_seed_is_rickys_fifteen_priced_and_worn_garments(closet: list[Garment]) -> None:
    assert len(closet) == 15
    assert len({g.id for g in closet}) == 15
    assert all(g.owner == "ricky" and g.id.startswith("ricky-") for g in closet)
    # Cost per wear needs both numbers
    assert all(g.price is not None and g.wears > 0 for g in closet)


def test_raincoat_is_buy_because_rain_is_due_and_ricky_owns_no_shell(
    closet: list[Garment],
) -> None:
    verdict = decide(RAINCOAT, closet, WEEK, TODAY)

    assert verdict.decision is Decision.BUY
    assert verdict.reasons[0].code is ReasonCode.FILLS_WEATHER_GAP
    assert verdict.headline == (
        "Buy it: you own no rain shell and rain is due on 3 of the next 7 days."
    )
    pairing_ids = [g.id for g in verdict.pairings]
    assert len(pairing_ids) >= 3
    assert "ricky-black-jeans" in pairing_ids


def test_navy_crewneck_is_skip_because_ricky_owns_three_navy_sweaters(
    closet: list[Garment],
) -> None:
    verdict = decide(NAVY_CREWNECK, closet, WEEK, TODAY)

    assert verdict.decision is Decision.SKIP
    assert len(verdict.duplicates) == 3
    assert verdict.headline == "Skip it: you already own 3 navy sweaters like this one."


def test_bold_shirt_is_try_with_her_black_jeans(closet: list[Garment]) -> None:
    verdict = decide(BOLD_SHIRT, closet, WEEK, TODAY)

    assert verdict.decision is Decision.TRY_WITH
    assert verdict.best_pairing is not None
    assert verdict.best_pairing.id == "ricky-black-jeans"
    assert verdict.headline.startswith("Try it with your black straight-leg jeans: ")


@pytest.mark.parametrize("candidate", [RAINCOAT, NAVY_CREWNECK, BOLD_SHIRT])
def test_the_job_interview_opens_no_event_gap(
    closet: list[Garment], candidate: GarmentTags
) -> None:
    verdict = decide(candidate, closet, WEEK, TODAY)

    assert ReasonCode.FITS_EVENT not in [r.code for r in verdict.reasons]
