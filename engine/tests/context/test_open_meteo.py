from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import httpx
import pytest
import respx

from fitcheck.context.open_meteo import ATTRIBUTION, FORECAST_URL, OpenMeteoWeather, build
from fitcheck.domain import Location, RunsOn
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings

# =============================================================================
# Module Overview
# =============================================================================
# Tests for `OpenMeteoWeather` against respx-mocked answers whose shape is copied
# from a real Open-Meteo response, plus one `live` test against the real API.

NEW_YORK = Location(latitude=40.7128, longitude=-74.0060, name="New York")


def _answer(days: int = 7) -> dict[str, Any]:
    """Return an Open-Meteo forecast answer as the API sent it on 2026-10-04."""
    daily: dict[str, list[Any]] = {
        "time": [
            "2026-10-04",
            "2026-10-05",
            "2026-10-06",
            "2026-10-07",
            "2026-10-08",
            "2026-10-09",
            "2026-10-10",
        ],
        "temperature_2m_max": [16.3, 18.8, 18.0, 21.8, 25.2, 20.8, 20.0],
        "temperature_2m_min": [13.6, 9.4, 5.9, 12.6, 15.6, 13.2, 14.4],
        "precipitation_sum": [0.80, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
        "precipitation_probability_max": [35, 2, 0, 0, 0, 2, 2],
        "weather_code": [51, 3, 0, 3, 3, 3, 3],
    }
    return {
        "latitude": 40.710335,
        "longitude": -73.99308,
        "generationtime_ms": 0.6684064865112305,
        "utc_offset_seconds": -14400,
        "timezone": "America/New_York",
        "timezone_abbreviation": "GMT-4",
        "elevation": 27.0,
        "daily_units": {
            "time": "iso8601",
            "temperature_2m_max": "°C",
            "temperature_2m_min": "°C",
            "precipitation_sum": "mm",
            "precipitation_probability_max": "%",
            "weather_code": "wmo code",
        },
        "daily": {field: values[:days] for field, values in daily.items()},
    }


class FakeClock:
    """A monotonic clock the test moves by hand."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def weather(clock: FakeClock) -> OpenMeteoWeather:
    return OpenMeteoWeather(clock=clock)


# =============================================================================
# Parsing and request shape
# =============================================================================


@respx.mock
def test_parses_daily_block_into_day_forecasts(weather: OpenMeteoWeather) -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=_answer()))

    forecast = weather.forecast(NEW_YORK, 7)

    assert forecast.location == NEW_YORK
    assert forecast.attribution == ATTRIBUTION
    assert len(forecast.days) == 7
    first = forecast.days[0]
    assert first.day == date(2026, 10, 4)
    assert (first.temp_min_c, first.temp_max_c) == (13.6, 16.3)
    assert first.precipitation_mm == 0.8
    assert first.precipitation_probability == 35
    assert first.weather_code == 51
    assert forecast.days[-1].day == date(2026, 10, 10)


@respx.mock
def test_sends_rounded_coordinates_and_daily_fields(weather: OpenMeteoWeather) -> None:
    route = respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=_answer(3)))

    weather.forecast(NEW_YORK, 3)

    params = route.calls.last.request.url.params
    assert params["latitude"] == "40.71"
    assert params["longitude"] == "-74.01"
    assert params["daily"] == (
        "temperature_2m_max,temperature_2m_min,precipitation_sum,"
        "precipitation_probability_max,weather_code"
    )
    assert params["timezone"] == "auto"
    assert params["forecast_days"] == "3"


@respx.mock
def test_accepts_null_probability_and_weather_code(weather: OpenMeteoWeather) -> None:
    answer = _answer(2)
    answer["daily"]["precipitation_probability_max"] = [35, None]
    answer["daily"]["weather_code"] = [51, None]
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=answer))

    forecast = weather.forecast(NEW_YORK, 2)

    assert forecast.days[1].precipitation_probability is None
    assert forecast.days[1].weather_code is None


def test_reports_public_api_with_open_meteo_licenses() -> None:
    info = build(Settings()).info
    assert info.name == "open-meteo"
    assert info.runs_on == RunsOn.PUBLIC_API
    assert info.license == "CC BY 4.0 data, AGPL-3.0 code"


@pytest.mark.parametrize("days", [0, 17])
def test_rejects_day_counts_open_meteo_cannot_serve(weather: OpenMeteoWeather, days: int) -> None:
    with pytest.raises(InvalidInput, match="days"):
        weather.forecast(NEW_YORK, days)


# =============================================================================
# Caching
# =============================================================================


@respx.mock
def test_serves_from_cache_for_30_minutes(weather: OpenMeteoWeather, clock: FakeClock) -> None:
    route = respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=_answer()))

    weather.forecast(NEW_YORK, 7)
    clock.now += 29 * 60
    weather.forecast(NEW_YORK, 7)
    assert route.call_count == 1

    clock.now += 60
    weather.forecast(NEW_YORK, 7)
    assert route.call_count == 2


@respx.mock
def test_cached_forecast_survives_network_loss(weather: OpenMeteoWeather) -> None:
    route = respx.get(FORECAST_URL)
    route.side_effect = [httpx.Response(200, json=_answer()), httpx.ConnectError("wifi down")]

    first = weather.forecast(NEW_YORK, 7)
    second = weather.forecast(NEW_YORK, 7)

    assert second == first


@respx.mock
def test_nearby_locations_share_an_entry_but_keep_their_own_name(
    weather: OpenMeteoWeather,
) -> None:
    route = respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=_answer()))
    nearby = Location(latitude=40.7131, longitude=-74.0058, name="Hotel")

    weather.forecast(NEW_YORK, 7)
    forecast = weather.forecast(nearby, 7)

    assert route.call_count == 1
    assert forecast.location == nearby


@respx.mock
def test_different_day_count_is_a_separate_entry(weather: OpenMeteoWeather) -> None:
    route = respx.get(FORECAST_URL)
    route.side_effect = [
        httpx.Response(200, json=_answer(7)),
        httpx.Response(200, json=_answer(3)),
    ]

    weather.forecast(NEW_YORK, 7)
    forecast = weather.forecast(NEW_YORK, 3)

    assert route.call_count == 2
    assert len(forecast.days) == 3


# =============================================================================
# Failures
# =============================================================================


@respx.mock
def test_server_error_raises_adapter_unavailable(weather: OpenMeteoWeather) -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(502, text="Bad Gateway"))

    with pytest.raises(AdapterUnavailable, match="HTTP 502"):
        weather.forecast(NEW_YORK, 7)


@respx.mock
def test_rejected_request_reports_open_meteo_reason(weather: OpenMeteoWeather) -> None:
    body = {"error": True, "reason": "Latitude must be in range of -90 to 90°. Given: 91.0."}
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(400, json=body))

    with pytest.raises(AdapterUnavailable, match="Latitude must be in range"):
        weather.forecast(NEW_YORK, 7)


@respx.mock
def test_timeout_raises_adapter_unavailable(weather: OpenMeteoWeather) -> None:
    respx.get(FORECAST_URL).mock(side_effect=httpx.ReadTimeout("slow"))

    with pytest.raises(AdapterUnavailable, match="did not answer"):
        weather.forecast(NEW_YORK, 7)


@respx.mock
def test_connection_error_raises_adapter_unavailable(weather: OpenMeteoWeather) -> None:
    respx.get(FORECAST_URL).mock(side_effect=httpx.ConnectError("no route to host"))

    with pytest.raises(AdapterUnavailable, match="unreachable"):
        weather.forecast(NEW_YORK, 7)


@pytest.mark.parametrize(
    "body",
    [
        {"latitude": 40.71},
        {"daily": {**_answer()["daily"], "temperature_2m_max": [16.3]}},
        {"daily": {**_answer()["daily"], "temperature_2m_min": [None] * 7}},
    ],
    ids=["no daily block", "lists differ in length", "null temperature"],
)
@respx.mock
def test_unexpected_shape_raises_adapter_unavailable(
    weather: OpenMeteoWeather, body: dict[str, Any]
) -> None:
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(200, json=body))

    with pytest.raises(AdapterUnavailable, match="unexpected shape"):
        weather.forecast(NEW_YORK, 7)


@respx.mock
def test_failure_is_not_cached(weather: OpenMeteoWeather) -> None:
    route = respx.get(FORECAST_URL)
    route.side_effect = [httpx.Response(503), httpx.Response(200, json=_answer())]

    with pytest.raises(AdapterUnavailable):
        weather.forecast(NEW_YORK, 7)
    forecast = weather.forecast(NEW_YORK, 7)

    assert len(forecast.days) == 7


# =============================================================================
# Live
# =============================================================================


@pytest.mark.live
def test_live_forecast_from_open_meteo() -> None:
    forecast = OpenMeteoWeather().forecast(NEW_YORK, 3)

    assert len(forecast.days) == 3
    # `timezone=auto` dates the forecast in New York, which can be a day off this machine
    assert abs(forecast.days[0].day - date.today()) <= timedelta(days=1)
    assert all(day.temp_min_c <= day.temp_max_c for day in forecast.days)
    assert forecast.attribution == ATTRIBUTION
