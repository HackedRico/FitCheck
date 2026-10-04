from __future__ import annotations

from datetime import date, timedelta

import pytest

from fitcheck.context.weather_fixture import ATTRIBUTION, FixtureWeather, build
from fitcheck.domain import Location, RunsOn
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings

# =============================================================================
# Module Overview
# =============================================================================
# Pins every number `FixtureWeather` serves. The demo verdicts depend on them, so a
# change here should fail loudly and be made on purpose.

TODAY = date(2026, 10, 5)
LISBON = Location(latitude=38.7223, longitude=-9.1393, name="Lisbon")


@pytest.fixture
def weather() -> FixtureWeather:
    return FixtureWeather(today=lambda: TODAY)


def test_serves_the_exact_demo_week(weather: FixtureWeather) -> None:
    forecast = weather.forecast(LISBON, 7)

    rows = [
        (
            d.day,
            d.temp_min_c,
            d.temp_max_c,
            d.precipitation_mm,
            d.precipitation_probability,
            d.weather_code,
        )
        for d in forecast.days
    ]
    assert rows == [
        (date(2026, 10, 5), 12.0, 19.0, 0.0, 5, 1),
        (date(2026, 10, 6), 10.0, 15.0, 6.5, 85, 63),
        (date(2026, 10, 7), 9.0, 17.0, 0.0, 15, 2),
        (date(2026, 10, 8), 11.0, 16.0, 3.8, 70, 61),
        (date(2026, 10, 9), 8.0, 14.0, 12.4, 90, 65),
        (date(2026, 10, 10), 13.0, 20.0, 0.0, 10, 0),
        (date(2026, 10, 11), 14.0, 18.0, 0.0, 20, 3),
    ]


def test_rain_falls_on_days_2_4_and_5_only(weather: FixtureWeather) -> None:
    forecast = weather.forecast(LISBON, 7)

    rainy = [n for n, d in enumerate(forecast.days, start=1) if d.precipitation_mm >= 1]
    assert rainy == [2, 4, 5]


def test_temperatures_stay_in_the_demo_ranges(weather: FixtureWeather) -> None:
    days = weather.forecast(LISBON, 7).days

    assert min(d.temp_min_c for d in days) == 8
    assert max(d.temp_min_c for d in days) == 14
    assert min(d.temp_max_c for d in days) == 14
    assert max(d.temp_max_c for d in days) == 20


def test_rain_probability_follows_the_rain(weather: FixtureWeather) -> None:
    for day in weather.forecast(LISBON, 7).days:
        probability = day.precipitation_probability or 0
        assert probability >= 70 if day.precipitation_mm >= 1 else probability <= 20


def test_honours_location_and_marks_itself_as_demo_data(weather: FixtureWeather) -> None:
    forecast = weather.forecast(LISBON, 7)

    assert forecast.location == LISBON
    assert forecast.attribution == ATTRIBUTION


def test_starts_on_the_real_date_by_default() -> None:
    forecast = build(Settings()).forecast(LISBON, 1)

    assert forecast.days[0].day == date.today()


def test_fewer_days_returns_the_start_of_the_week(weather: FixtureWeather) -> None:
    days = weather.forecast(LISBON, 3).days

    assert [d.day for d in days] == [TODAY + timedelta(days=n) for n in range(3)]
    assert days == weather.forecast(LISBON, 7).days[:3]


def test_more_than_seven_days_repeats_the_week(weather: FixtureWeather) -> None:
    days = weather.forecast(LISBON, 10).days

    assert len(days) == 10
    assert days[7].day == TODAY + timedelta(days=7)
    assert days[7].precipitation_mm == days[0].precipitation_mm
    assert days[9].precipitation_mm == days[2].precipitation_mm


def test_rejects_zero_days(weather: FixtureWeather) -> None:
    with pytest.raises(InvalidInput, match="days"):
        weather.forecast(LISBON, 0)


def test_runs_on_this_machine() -> None:
    assert build(Settings()).info.runs_on == RunsOn.THIS_MACHINE
