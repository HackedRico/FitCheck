from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta
from typing import NamedTuple

from fitcheck.domain import AdapterInfo, DayForecast, Forecast, Location, RunsOn
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings

# =============================================================================
# Module Overview
# =============================================================================
# `FixtureWeather` serves one fixed week of cool, wet autumn weather, starting today,
# with no network. The demo verdicts depend on these exact numbers: rain of at least
# 1 mm falls on days 2, 4 and 5, lows run 8 to 14 C and highs 14 to 20 C.

ATTRIBUTION = "Demo weather, not a real forecast"


class _Day(NamedTuple):
    temp_min_c: float
    temp_max_c: float
    precipitation_mm: float
    precipitation_probability: int
    # WMO weather interpretation code, the same scale Open-Meteo reports
    weather_code: int


# Day 1 is today. Changing a number here changes the demo verdicts.
_WEEK: tuple[_Day, ...] = (
    _Day(12.0, 19.0, 0.0, 5, 1),  # mainly clear
    _Day(10.0, 15.0, 6.5, 85, 63),  # moderate rain
    _Day(9.0, 17.0, 0.0, 15, 2),  # partly cloudy
    _Day(11.0, 16.0, 3.8, 70, 61),  # slight rain
    _Day(8.0, 14.0, 12.4, 90, 65),  # heavy rain
    _Day(13.0, 20.0, 0.0, 10, 0),  # clear sky
    _Day(14.0, 18.0, 0.0, 20, 3),  # overcast
)


class FixtureWeather:
    """Deterministic offline forecast for demos and tests."""

    info = AdapterInfo(name="weather-fixture", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

    def __init__(self, today: Callable[[], date] = date.today) -> None:
        self._today = today

    def forecast(self, location: Location, days: int) -> Forecast:
        """Return the fixed week from today at `location`; past day 7 the week repeats."""
        if days < 1:
            raise InvalidInput("days must be at least 1")
        start = self._today()
        forecast_days = tuple(
            _to_forecast(start + timedelta(days=offset), _WEEK[offset % len(_WEEK)])
            for offset in range(days)
        )
        return Forecast(location=location, days=forecast_days, attribution=ATTRIBUTION)


def _to_forecast(day: date, values: _Day) -> DayForecast:
    return DayForecast(
        day=day,
        temp_min_c=values.temp_min_c,
        temp_max_c=values.temp_max_c,
        precipitation_mm=values.precipitation_mm,
        precipitation_probability=values.precipitation_probability,
        weather_code=values.weather_code,
    )


def build(settings: Settings) -> FixtureWeather:
    """Return the fixture weather source; it needs no settings."""
    return FixtureWeather()
