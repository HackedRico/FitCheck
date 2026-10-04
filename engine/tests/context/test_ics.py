from __future__ import annotations

from datetime import UTC, date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest
import respx
from pydantic import SecretStr

from fitcheck.context.ics import ENV_VAR, IcsCalendar, build
from fitcheck.domain import RunsOn
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings

# =============================================================================
# Module Overview
# =============================================================================
# Tests for `IcsCalendar` over `week.ics`, a feed with a weekly series that skips one
# date, an all-day wedding, a UTC meeting, a floating appointment, a cancelled event
# and one event past the window. Remote feeds are served by respx.

FEED = Path(__file__).with_name("week.ics")
SECRET_URL = (
    "https://calendar.example.test/calendar/ical/maya%40example.test/private-s3cr3t/basic.ics"
)
NEW_YORK = ZoneInfo("America/New_York")
START = date(2026, 10, 5)


class FakeClock:
    """A monotonic clock the test moves by hand."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _calendar(source: str | Path, clock: FakeClock | None = None) -> IcsCalendar:
    if clock is None:
        return IcsCalendar(SecretStr(str(source)))
    return IcsCalendar(SecretStr(str(source)), clock=clock)


# =============================================================================
# Reading the feed
# =============================================================================


def test_expands_the_week_from_a_local_file() -> None:
    events = _calendar(FEED).upcoming("maya", START, 7)

    rows = [(e.title, e.start, e.end, e.location, e.formality) for e in events]
    assert rows == [
        (
            "Morning run",
            datetime(2026, 10, 6, 7, 0, tzinfo=NEW_YORK),
            datetime(2026, 10, 6, 7, 45, tzinfo=NEW_YORK),
            None,
            1,
        ),
        (
            "Client meeting with Acme",
            datetime(2026, 10, 7, 14, 0, tzinfo=UTC),
            datetime(2026, 10, 7, 15, 0, tzinfo=UTC),
            "Acme HQ",
            4,
        ),
        (
            "Dentist",
            datetime(2026, 10, 9, 9, 0, tzinfo=NEW_YORK),
            datetime(2026, 10, 9, 9, 0, tzinfo=NEW_YORK),
            None,
            None,
        ),
        (
            "Sam's wedding",
            datetime(2026, 10, 10, 0, 0, tzinfo=NEW_YORK),
            datetime(2026, 10, 11, 0, 0, tzinfo=NEW_YORK),
            "Brooklyn Botanic Garden",
            5,
        ),
    ]


def test_all_day_event_starts_at_midnight_in_the_feed_zone() -> None:
    events = _calendar(FEED).upcoming("maya", START, 7)
    wedding = next(e for e in events if e.title == "Sam's wedding")

    assert wedding.start.date() == date(2026, 10, 10)
    assert wedding.start.time() == time(0, 0)
    assert wedding.start.utcoffset() == datetime(2026, 10, 10, tzinfo=NEW_YORK).utcoffset()


def test_recurring_series_repeats_weekly_and_skips_excluded_dates() -> None:
    events = _calendar(FEED).upcoming("maya", START, 14)

    runs = [e.start.date() for e in events if e.title == "Morning run"]
    assert runs == [date(2026, 10, 6), date(2026, 10, 13), date(2026, 10, 15)]


def test_skips_cancelled_events_and_events_past_the_window() -> None:
    titles = {e.title for e in _calendar(FEED).upcoming("maya", START, 7)}

    assert "Team drinks" not in titles
    assert "Museum gala" not in titles


def test_window_includes_events_on_its_last_day() -> None:
    events = _calendar(FEED).upcoming("maya", date(2026, 10, 14), 7)

    assert [e.title for e in events][-1] == "Museum gala"


def test_floating_time_without_a_feed_zone_uses_this_machine_zone(tmp_path: Path) -> None:
    feed = tmp_path / "floating.ics"
    feed.write_text(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//FitCheck//Test//EN\r\n"
        "BEGIN:VEVENT\r\nUID:a@fitcheck.test\r\nSUMMARY:Coffee\r\n"
        "DTSTART:20261006T090000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    )

    [event] = _calendar(feed).upcoming("maya", START, 7)

    assert event.start.tzinfo is not None
    assert event.start.replace(tzinfo=None) == datetime(2026, 10, 6, 9, 0)
    assert event.formality == 2


def test_local_file_runs_on_this_machine() -> None:
    assert _calendar(FEED).info.runs_on == RunsOn.THIS_MACHINE


def test_rejects_zero_days() -> None:
    with pytest.raises(InvalidInput):
        _calendar(FEED).upcoming("maya", START, 0)


# =============================================================================
# Remote feeds and caching
# =============================================================================


@respx.mock
def test_reads_a_remote_feed_over_https() -> None:
    respx.get(SECRET_URL).mock(return_value=httpx.Response(200, content=FEED.read_bytes()))
    calendar = _calendar(SECRET_URL)

    events = calendar.upcoming("maya", START, 7)

    assert len(events) == 4
    assert calendar.info.runs_on == RunsOn.PUBLIC_API


@respx.mock
def test_webcal_address_is_fetched_over_https() -> None:
    route = respx.get(SECRET_URL).mock(return_value=httpx.Response(200, content=FEED.read_bytes()))

    _calendar(SECRET_URL.replace("https://", "webcal://")).upcoming("maya", START, 7)

    assert route.call_count == 1


@respx.mock
def test_caches_the_feed_for_5_minutes() -> None:
    route = respx.get(SECRET_URL).mock(return_value=httpx.Response(200, content=FEED.read_bytes()))
    clock = FakeClock()
    calendar = _calendar(SECRET_URL, clock)

    calendar.upcoming("maya", START, 7)
    clock.now += 4 * 60
    calendar.upcoming("maya", date(2026, 10, 12), 7)
    assert route.call_count == 1

    clock.now += 60
    calendar.upcoming("maya", START, 7)
    assert route.call_count == 2


# =============================================================================
# Configuration and failures
# =============================================================================


def test_build_without_the_setting_names_the_env_var() -> None:
    with pytest.raises(AdapterUnavailable, match=ENV_VAR):
        build(Settings(calendar_ics_url=None))


def test_build_reads_the_setting() -> None:
    calendar = build(Settings(calendar_ics_url=SecretStr(str(FEED))))

    assert len(calendar.upcoming("maya", START, 7)) == 4


@pytest.mark.parametrize("address", ["", "   "])
def test_rejects_an_empty_setting(address: str) -> None:
    with pytest.raises(AdapterUnavailable, match=ENV_VAR):
        _calendar(address)


def test_rejects_plain_http() -> None:
    with pytest.raises(AdapterUnavailable, match="https"):
        _calendar(SECRET_URL.replace("https://", "http://"))


def test_rejects_other_schemes() -> None:
    with pytest.raises(AdapterUnavailable, match="https address or a file path"):
        _calendar("ftp://calendar.example.test/basic.ics")


def _assert_secret_hidden(error: AdapterUnavailable) -> None:
    assert "s3cr3t" not in str(error)
    assert "calendar.example.test" not in str(error)
    assert error.__cause__ is None


@respx.mock
def test_http_error_raises_without_revealing_the_address() -> None:
    respx.get(SECRET_URL).mock(return_value=httpx.Response(404))

    with pytest.raises(AdapterUnavailable, match="HTTP 404") as caught:
        _calendar(SECRET_URL).upcoming("maya", START, 7)

    _assert_secret_hidden(caught.value)


@respx.mock
def test_timeout_raises_without_revealing_the_address() -> None:
    respx.get(SECRET_URL).mock(side_effect=httpx.ReadTimeout(f"timed out reading {SECRET_URL}"))

    with pytest.raises(AdapterUnavailable, match="did not answer") as caught:
        _calendar(SECRET_URL).upcoming("maya", START, 7)

    _assert_secret_hidden(caught.value)
    assert caught.value.__suppress_context__


@respx.mock
def test_connection_error_raises_without_revealing_the_address() -> None:
    respx.get(SECRET_URL).mock(side_effect=httpx.ConnectError(f"cannot reach {SECRET_URL}"))

    with pytest.raises(AdapterUnavailable, match="unreachable") as caught:
        _calendar(SECRET_URL).upcoming("maya", START, 7)

    _assert_secret_hidden(caught.value)
    assert caught.value.__suppress_context__


@respx.mock
def test_invalid_feed_raises_adapter_unavailable() -> None:
    respx.get(SECRET_URL).mock(return_value=httpx.Response(200, text="<html>Sign in</html>"))

    with pytest.raises(AdapterUnavailable, match="not a valid iCalendar file"):
        _calendar(SECRET_URL).upcoming("maya", START, 7)


def test_missing_file_raises_adapter_unavailable(tmp_path: Path) -> None:
    with pytest.raises(AdapterUnavailable, match="Cannot read"):
        _calendar(tmp_path / "absent.ics").upcoming("maya", START, 7)


def test_failed_fetch_is_not_cached(tmp_path: Path) -> None:
    feed = tmp_path / "later.ics"
    calendar = _calendar(feed)
    with pytest.raises(AdapterUnavailable):
        calendar.upcoming("maya", START, 7)

    feed.write_bytes(FEED.read_bytes())

    assert len(calendar.upcoming("maya", START, 7)) == 4
