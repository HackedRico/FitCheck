from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

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
    Reason,
    ReasonCode,
    WeekContext,
)
from fitcheck.verdict import decide

TODAY = date(2026, 10, 5)

# =============================================================================
# Module Overview
# =============================================================================
# Specification tests for `decide`, one rule per test. Each builds a tiny closet and
# week by hand, so a failing test names the rule that broke rather than a demo prop.


def tags(
    category: Category,
    color: ColorFamily,
    *,
    pattern: Pattern = Pattern.SOLID,
    warmth: int = 2,
    waterproof: bool = False,
    formality: int = 2,
    description: str = "",
) -> GarmentTags:
    """Return garment tags with quiet defaults, so a test states only what it is about."""
    return GarmentTags(
        category=category,
        color_family=color,
        pattern=pattern,
        warmth=warmth,
        waterproof=waterproof,
        formality=formality,
        description=description or f"{color} {category}",
    )


def garment(garment_id: str, garment_tags: GarmentTags, *, wears: int = 0) -> Garment:
    """Return a closet garment owned by `maya`."""
    return Garment(
        id=garment_id, owner="maya", tags=garment_tags, price=Decimal("50.00"), wears=wears
    )


def week(
    *,
    rain_mm: tuple[float, ...] = (0.0,) * 7,
    lows: tuple[float, ...] | None = None,
    events: tuple[CalendarEvent, ...] = (),
) -> WeekContext:
    """Return a week from `TODAY`, one forecast day per `rain_mm` entry, lows 10 C by default."""
    lows = lows or (10.0,) * len(rain_mm)
    days = tuple(
        DayForecast(
            day=TODAY + timedelta(days=offset),
            temp_min_c=low,
            temp_max_c=low + 6,
            precipitation_mm=mm,
        )
        for offset, (mm, low) in enumerate(zip(rain_mm, lows, strict=True))
    )
    forecast = Forecast(location=Location(latitude=40.7, longitude=-74.0), days=days)
    return WeekContext(forecast=forecast, events=events)


def event(title: str, formality: int | None, *, in_days: int = 2) -> CalendarEvent:
    """Return a calendar event `in_days` days after `TODAY`, at 10:00."""
    start = datetime.combine(TODAY + timedelta(days=in_days), datetime.min.time())
    return CalendarEvent(title=title, start=start.replace(hour=10), formality=formality)


NAVY_SWEATER = tags(Category.SWEATER, ColorFamily.NAVY, formality=2)
DRY = week()


# =============================================================================
# Duplicates
# =============================================================================


def test_two_duplicates_mean_skip() -> None:
    closet = [
        garment("navy-1", tags(Category.SWEATER, ColorFamily.NAVY, formality=2)),
        garment("navy-2", tags(Category.SWEATER, ColorFamily.NAVY, formality=3)),
        garment("jeans", tags(Category.BOTTOM, ColorFamily.BLUE, formality=2)),
    ]

    verdict = decide(NAVY_SWEATER, closet, DRY, TODAY)

    assert verdict.decision is Decision.SKIP
    assert [g.id for g in verdict.duplicates] == ["navy-1", "navy-2"]
    assert verdict.reasons[0].code is ReasonCode.DUPLICATES
    assert verdict.reasons[0].garment_ids == ("navy-1", "navy-2")
    assert verdict.headline == "Skip it: you already own 2 navy sweaters like this one."


def test_a_different_pattern_or_a_formality_gap_of_two_is_not_a_duplicate() -> None:
    closet = [
        garment("navy-stripe", tags(Category.SWEATER, ColorFamily.NAVY, pattern=Pattern.STRIPE)),
        garment("navy-formal", tags(Category.SWEATER, ColorFamily.NAVY, formality=4)),
        garment("navy-close", tags(Category.SWEATER, ColorFamily.NAVY, formality=1)),
    ]

    verdict = decide(NAVY_SWEATER, closet, DRY, TODAY)

    assert [g.id for g in verdict.duplicates] == ["navy-close"]


# =============================================================================
# Pairings
# =============================================================================

GREEN_SWEATER = tags(Category.SWEATER, ColorFamily.GREEN, formality=2)


def test_three_pairings_and_no_duplicates_mean_buy() -> None:
    closet = [
        garment("black-jeans", tags(Category.BOTTOM, ColorFamily.BLACK, formality=3), wears=80),
        garment("blue-jeans", tags(Category.BOTTOM, ColorFamily.BLUE, formality=2), wears=52),
        garment("sneakers", tags(Category.SHOES, ColorFamily.WHITE, formality=2), wears=95),
        # Too formal to pair, and a tee does not go under a sweater in these rules
        garment("blazer", tags(Category.OUTERWEAR, ColorFamily.BLACK, formality=4)),
        garment("tee", tags(Category.TOP, ColorFamily.WHITE, formality=2)),
    ]

    verdict = decide(GREEN_SWEATER, closet, DRY, TODAY)

    assert verdict.decision is Decision.BUY
    # Closest formality first, then most worn
    assert [g.id for g in verdict.pairings] == ["sneakers", "blue-jeans", "black-jeans"]
    assert verdict.best_pairing is not None
    assert verdict.best_pairing.id == "sneakers"
    assert [r.code for r in verdict.reasons] == [ReasonCode.PAIRS_WELL]
    assert verdict.reasons[0].garment_ids == ("sneakers", "blue-jeans", "black-jeans")
    assert verdict.headline == "Buy it: it goes with 3 things you own and you have nothing like it."


def test_nothing_to_pair_with_and_no_gap_means_skip() -> None:
    closet = [
        garment("blazer", tags(Category.OUTERWEAR, ColorFamily.BLACK, formality=4)),
        garment("tee", tags(Category.TOP, ColorFamily.WHITE, formality=2)),
    ]

    verdict = decide(GREEN_SWEATER, closet, DRY, TODAY)

    assert verdict.decision is Decision.SKIP
    assert verdict.pairings == ()
    assert [r.code for r in verdict.reasons] == [ReasonCode.FEW_PAIRINGS]
    assert verdict.reasons[0].garment_ids == ()
    assert verdict.headline == "Skip it: nothing you own goes with it."


# =============================================================================
# Try with
# =============================================================================


def test_one_or_two_pairings_mean_try_with_the_best_one() -> None:
    closet = [
        garment("sneakers", tags(Category.SHOES, ColorFamily.WHITE, formality=3), wears=90),
        garment(
            "jeans",
            tags(Category.BOTTOM, ColorFamily.BLUE, formality=2, description="Blue mom jeans"),
            wears=10,
        ),
    ]

    verdict = decide(GREEN_SWEATER, closet, DRY, TODAY)

    assert verdict.decision is Decision.TRY_WITH
    assert verdict.best_pairing is not None
    assert verdict.best_pairing.id == "jeans"
    assert [r.code for r in verdict.reasons] == [ReasonCode.FEW_PAIRINGS]
    assert verdict.reasons[0].garment_ids == ("jeans", "sneakers")
    assert verdict.headline == "Try it with your blue mom jeans: only 2 things you own go with it."


def test_one_duplicate_means_try_with_even_when_it_pairs_well() -> None:
    closet = [
        garment(
            "navy-crew",
            tags(Category.SWEATER, ColorFamily.NAVY, formality=3, description="navy merino crew"),
        ),
        garment(
            "jeans",
            tags(Category.BOTTOM, ColorFamily.BLACK, formality=2, description="black jeans"),
            wears=60,
        ),
        garment("chinos", tags(Category.BOTTOM, ColorFamily.BEIGE, formality=2), wears=20),
        garment("boots", tags(Category.SHOES, ColorFamily.BROWN, formality=3), wears=30),
    ]

    verdict = decide(NAVY_SWEATER, closet, DRY, TODAY)

    assert verdict.decision is Decision.TRY_WITH
    assert [r.code for r in verdict.reasons] == [ReasonCode.DUPLICATES, ReasonCode.PAIRS_WELL]
    assert verdict.reasons[0].garment_ids == ("navy-crew",)
    assert verdict.headline == (
        "Try it with your black jeans: it is close to your navy merino crew, "
        "so make sure it adds something."
    )


FLORAL_SHIRT = tags(Category.SHIRT, ColorFamily.MULTI, pattern=Pattern.FLORAL, formality=3)


def test_a_bold_print_means_try_with_even_when_it_pairs_well() -> None:
    closet = [
        garment("chinos", tags(Category.BOTTOM, ColorFamily.BEIGE, formality=3), wears=14),
        garment(
            "black-jeans",
            tags(Category.BOTTOM, ColorFamily.BLACK, formality=3, description="black jeans"),
            wears=87,
        ),
        garment("boots", tags(Category.SHOES, ColorFamily.BROWN, formality=3), wears=30),
    ]

    verdict = decide(FLORAL_SHIRT, closet, DRY, TODAY)

    assert verdict.decision is Decision.TRY_WITH
    assert verdict.best_pairing is not None
    assert verdict.best_pairing.id == "black-jeans"
    assert [r.code for r in verdict.reasons] == [ReasonCode.STATEMENT_PIECE, ReasonCode.PAIRS_WELL]
    assert verdict.headline == (
        "Try it with your black jeans: a bold print can clash with clothes that match it "
        "on paper, so see them together first."
    )


def test_stripes_and_checks_read_as_basics() -> None:
    striped = tags(Category.SHIRT, ColorFamily.BLUE, pattern=Pattern.STRIPE, formality=3)
    closet = [
        garment("chinos", tags(Category.BOTTOM, ColorFamily.BEIGE, formality=3)),
        garment("jeans", tags(Category.BOTTOM, ColorFamily.BLACK, formality=3)),
        garment("boots", tags(Category.SHOES, ColorFamily.BROWN, formality=3)),
    ]

    assert decide(striped, closet, DRY, TODAY).decision is Decision.BUY


def test_two_patterned_garments_do_not_pair() -> None:
    closet = [
        garment(
            "striped-skirt",
            tags(Category.BOTTOM, ColorFamily.NAVY, pattern=Pattern.STRIPE, formality=3),
            wears=99,
        ),
        garment("jeans", tags(Category.BOTTOM, ColorFamily.BLACK, formality=3)),
    ]

    verdict = decide(FLORAL_SHIRT, closet, DRY, TODAY)

    assert [g.id for g in verdict.pairings] == ["jeans"]


# =============================================================================
# Weather gaps
# =============================================================================

RAINCOAT = tags(Category.OUTERWEAR, ColorFamily.YELLOW, waterproof=True, warmth=3)
DENIM_JACKET = garment("denim", tags(Category.OUTERWEAR, ColorFamily.BLUE))
JEANS = garment("jeans", tags(Category.BOTTOM, ColorFamily.BLACK, description="black jeans"))
RAINY = week(rain_mm=(0.0, 6.5, 0.0, 3.8, 12.4, 0.0, 0.0))


def test_waterproof_outerwear_fills_a_rain_gap() -> None:
    verdict = decide(RAINCOAT, [DENIM_JACKET, JEANS], RAINY, TODAY)

    assert verdict.decision is Decision.BUY
    assert [r.code for r in verdict.reasons] == [
        ReasonCode.FILLS_WEATHER_GAP,
        ReasonCode.FEW_PAIRINGS,
    ]
    assert verdict.best_pairing == JEANS
    assert verdict.headline == (
        "Buy it: you own no rain shell and rain is due on 3 of the next 7 days."
    )


def _codes(verdict_reasons: tuple[Reason, ...]) -> list[ReasonCode]:
    return [r.code for r in verdict_reasons]


@pytest.mark.parametrize(
    ("closet", "the_week"),
    [
        pytest.param(
            [garment("shell", tags(Category.OUTERWEAR, ColorFamily.BLACK, waterproof=True))],
            RAINY,
            id="already owns a waterproof jacket",
        ),
        pytest.param([], week(rain_mm=(0.0, 6.5, 0.0)), id="only one wet day"),
        pytest.param([], WeekContext(), id="no forecast"),
    ],
)
def test_no_rain_gap(closet: list[Garment], the_week: WeekContext) -> None:
    verdict = decide(RAINCOAT, closet, the_week, TODAY)

    assert ReasonCode.FILLS_WEATHER_GAP not in _codes(verdict.reasons)


def test_a_high_chance_of_rain_counts_as_a_wet_day() -> None:
    days = tuple(
        DayForecast(
            day=TODAY + timedelta(days=offset),
            temp_min_c=10,
            temp_max_c=16,
            precipitation_mm=0.0,
            precipitation_probability=chance,
        )
        for offset, chance in enumerate((60, 80, 10))
    )
    the_week = WeekContext(forecast=Forecast(location=Location(latitude=0, longitude=0), days=days))

    verdict = decide(RAINCOAT, [], the_week, TODAY)

    assert verdict.decision is Decision.BUY
    assert verdict.headline == (
        "Buy it: you own no rain shell and rain is due on 2 of the next 3 days."
    )


def test_days_before_today_do_not_count() -> None:
    # Three wet days in the week, but only one of them is today or later
    verdict = decide(RAINCOAT, [], RAINY, TODAY + timedelta(days=4))

    assert ReasonCode.FILLS_WEATHER_GAP not in _codes(verdict.reasons)


PARKA = tags(Category.OUTERWEAR, ColorFamily.GREEN, warmth=4)
COLD_SNAP = week(rain_mm=(0.0,) * 4, lows=(9.0, 3.6, -1.0, 6.0))


def test_warm_outerwear_fills_a_cold_gap_naming_the_coldest_day() -> None:
    verdict = decide(PARKA, [DENIM_JACKET, JEANS], COLD_SNAP, TODAY)

    assert verdict.decision is Decision.BUY
    assert _codes(verdict.reasons)[0] is ReasonCode.FILLS_WEATHER_GAP
    assert verdict.headline == "Buy it: you own no warm coat and it drops to -1 C on Wednesday."


@pytest.mark.parametrize(
    ("candidate", "closet", "the_week"),
    [
        pytest.param(
            PARKA,
            [garment("coat", tags(Category.OUTERWEAR, ColorFamily.BEIGE, warmth=4))],
            COLD_SNAP,
            id="already owns a warm coat",
        ),
        pytest.param(PARKA, [], week(lows=(5.5,) * 7), id="no day at 5 C or colder"),
        pytest.param(DENIM_JACKET.tags, [], COLD_SNAP, id="candidate is not warm"),
    ],
)
def test_no_cold_gap(candidate: GarmentTags, closet: list[Garment], the_week: WeekContext) -> None:
    verdict = decide(candidate, closet, the_week, TODAY)

    assert ReasonCode.FILLS_WEATHER_GAP not in _codes(verdict.reasons)


# =============================================================================
# Event gaps
# =============================================================================

LOAFERS = tags(Category.SHOES, ColorFamily.BLACK, formality=4)
SNEAKERS = garment("sneakers", tags(Category.SHOES, ColorFamily.WHITE, formality=2))


def test_a_dressy_enough_candidate_fits_each_formal_event_in_date_order() -> None:
    the_week = week(
        events=(
            event("Gala", 5, in_days=5),
            event("Job interview", 4, in_days=3),
            event("Team dinner", 3, in_days=1),
        )
    )

    verdict = decide(LOAFERS, [SNEAKERS, JEANS], the_week, TODAY)

    assert verdict.decision is Decision.BUY
    fits = [r for r in verdict.reasons if r.code is ReasonCode.FITS_EVENT]
    assert [r.message.split(" on ")[0] for r in fits] == ["Job interview", "Gala"]
    assert verdict.headline == (
        "Buy it: you have no shoes dressy enough for Job interview on Thursday."
    )


@pytest.mark.parametrize(
    ("candidate", "closet", "the_event"),
    [
        pytest.param(
            LOAFERS,
            [garment("boots", tags(Category.SHOES, ColorFamily.BROWN, formality=3))],
            event("Job interview", 4),
            id="owns shoes within one of the dress code",
        ),
        pytest.param(
            tags(Category.SHOES, ColorFamily.BLACK, formality=2),
            [],
            event("Job interview", 4),
            id="candidate too casual",
        ),
        pytest.param(LOAFERS, [], event("Team dinner", 3), id="event not formal"),
        pytest.param(LOAFERS, [], event("Lunch", None), id="no dress code known"),
        pytest.param(LOAFERS, [], event("Job interview", 4, in_days=-1), id="event already past"),
    ],
)
def test_no_event_gap(
    candidate: GarmentTags, closet: list[Garment], the_event: CalendarEvent
) -> None:
    verdict = decide(candidate, closet, week(events=(the_event,)), TODAY)

    assert ReasonCode.FITS_EVENT not in _codes(verdict.reasons)


# =============================================================================
# Precedence and empty inputs
# =============================================================================


def test_a_filled_gap_beats_duplicates_that_do_not_cover_it() -> None:
    light_jackets = [
        garment(f"green-{n}", tags(Category.OUTERWEAR, ColorFamily.GREEN, warmth=2))
        for n in range(2)
    ]

    verdict = decide(PARKA, light_jackets, COLD_SNAP, TODAY)

    assert verdict.decision is Decision.BUY
    assert verdict.duplicates == ()


def test_an_empty_closet_and_week_still_get_a_verdict() -> None:
    verdict = decide(GREEN_SWEATER, [], WeekContext(), TODAY)

    assert verdict.decision is Decision.SKIP
    assert _codes(verdict.reasons) == [ReasonCode.FEW_PAIRINGS]
    assert verdict.best_pairing is None
