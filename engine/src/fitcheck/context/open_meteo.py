from __future__ import annotations

import time
from collections.abc import Callable
from datetime import date
from threading import Lock

import httpx
from pydantic import BaseModel, ValidationError, model_validator

from fitcheck.domain import AdapterInfo, DayForecast, Forecast, Location, RunsOn
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
# Open-Meteo's CC BY 4.0 data license requires this credit wherever the forecast shows
ATTRIBUTION = "Weather data by Open-Meteo.com"
MAX_DAYS = 16
CACHE_TTL_S = 30 * 60
TIMEOUT_S = 10.0
# Two decimals is about 1 km: close enough for weather, and it keeps the exact spot private
_COORD_DECIMALS = 2
_DAILY_FIELDS = (
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "weather_code",
)

# =============================================================================
# Module Overview
# =============================================================================
# `OpenMeteoWeather` fetches a daily forecast from the free Open-Meteo API. It sends
# only rounded coordinates, never an image. Answers are cached in memory for 30
# minutes per rounded location and day count, so a stage demo survives a wifi drop
# after the first call. Any HTTP failure raises `AdapterUnavailable`.

_CacheKey = tuple[float, float, int]


class _Daily(BaseModel):
    """The `daily` block of an Open-Meteo answer: one list per field, one entry per day."""

    time: list[date]
    temperature_2m_max: list[float]
    temperature_2m_min: list[float]
    precipitation_sum: list[float]
    # Open-Meteo returns `null` here for days past the probability model's horizon
    precipitation_probability_max: list[int | None]
    weather_code: list[int | None]

    @model_validator(mode="after")
    def _same_length(self) -> _Daily:
        lengths = {len(getattr(self, field)) for field in ("time", *_DAILY_FIELDS)}
        if len(lengths) != 1:
            raise ValueError("daily lists differ in length")
        return self


class _Answer(BaseModel):
    daily: _Daily


class OpenMeteoWeather:
    """Daily forecast from api.open-meteo.com, cached in memory."""

    info = AdapterInfo(
        name="open-meteo", license="CC BY 4.0 data, AGPL-3.0 code", runs_on=RunsOn.PUBLIC_API
    )

    def __init__(
        self,
        *,
        url: str = FORECAST_URL,
        timeout_s: float = TIMEOUT_S,
        cache_ttl_s: float = CACHE_TTL_S,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._url = url
        self._timeout_s = timeout_s
        self._cache_ttl_s = cache_ttl_s
        self._clock = clock
        # key -> (fetched at, forecast); FastAPI runs sync routes on a thread pool
        self._cache: dict[_CacheKey, tuple[float, Forecast]] = {}
        self._lock = Lock()

    def forecast(self, location: Location, days: int) -> Forecast:
        """Return a `days`-day forecast from today at `location`, from cache when fresh."""
        if not 1 <= days <= MAX_DAYS:
            raise InvalidInput(f"days must be between 1 and {MAX_DAYS} for Open-Meteo")
        key = (
            round(location.latitude, _COORD_DECIMALS),
            round(location.longitude, _COORD_DECIMALS),
            days,
        )
        cached = self._fresh(key)
        if cached is None:
            cached = self._fetch(key)
            with self._lock:
                self._cache[key] = (self._clock(), cached)
        # Nearby locations share a cache entry; report the one the caller asked about
        return cached.model_copy(update={"location": location})

    def _fresh(self, key: _CacheKey) -> Forecast | None:
        with self._lock:
            entry = self._cache.get(key)
        if entry is None or self._clock() - entry[0] >= self._cache_ttl_s:
            return None
        return entry[1]

    def _fetch(self, key: _CacheKey) -> Forecast:
        """Call Open-Meteo for the rounded location in `key` and parse the daily block."""
        latitude, longitude, days = key
        params: dict[str, str | int | float] = {
            "latitude": latitude,
            "longitude": longitude,
            "daily": ",".join(_DAILY_FIELDS),
            # Days follow the place's own midnight, not the server's
            "timezone": "auto",
            "forecast_days": days,
        }
        try:
            response = httpx.get(self._url, params=params, timeout=self._timeout_s)
        except httpx.TimeoutException as exc:
            raise AdapterUnavailable(
                f"Open-Meteo did not answer within {self._timeout_s:g} s."
            ) from exc
        except httpx.HTTPError as exc:
            raise AdapterUnavailable(f"Open-Meteo is unreachable: {exc}") from exc
        if response.is_error:
            raise AdapterUnavailable(
                f"Open-Meteo answered HTTP {response.status_code}: {_reason(response)}"
            )
        try:
            daily = _Answer.model_validate_json(response.content).daily
        except ValidationError as exc:
            raise AdapterUnavailable("Open-Meteo sent a forecast in an unexpected shape.") from exc
        return Forecast(
            location=Location(latitude=latitude, longitude=longitude),
            days=_to_days(daily),
            attribution=ATTRIBUTION,
        )


def _to_days(daily: _Daily) -> tuple[DayForecast, ...]:
    rows = zip(
        daily.time,
        daily.temperature_2m_min,
        daily.temperature_2m_max,
        daily.precipitation_sum,
        daily.precipitation_probability_max,
        daily.weather_code,
        strict=True,
    )
    return tuple(
        DayForecast(
            day=day,
            temp_min_c=temp_min,
            temp_max_c=temp_max,
            precipitation_mm=precipitation,
            precipitation_probability=probability,
            weather_code=code,
        )
        for day, temp_min, temp_max, precipitation, probability, code in rows
    )


def _reason(response: httpx.Response) -> str:
    """Return Open-Meteo's `reason` field from an error answer, or the status phrase."""
    try:
        body = response.json()
    except ValueError:
        return response.reason_phrase
    reason = body.get("reason") if isinstance(body, dict) else None
    return str(reason) if reason else response.reason_phrase


def build(settings: Settings) -> OpenMeteoWeather:
    """Return an Open-Meteo weather source; it needs no key or settings."""
    return OpenMeteoWeather()
