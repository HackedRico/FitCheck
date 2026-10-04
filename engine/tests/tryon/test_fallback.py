from __future__ import annotations

from typing import Literal

import pytest

from fitcheck.domain import AdapterInfo, RunsOn, TryOnRegion, TryOnRequest, TryOnResult
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings
from fitcheck.tryon.fallback import FallbackRenderer
from fitcheck.tryon.overlay import OverlayRenderer
from fitcheck.wiring import _build_renderer

# =============================================================================
# Module Overview
# =============================================================================
# Tests for `FallbackRenderer`: the backup renders only while the primary is
# unavailable, the cooldown skips the primary and then expires, bad input still
# raises, and `wiring` wraps the try-on adapter only when a different fallback is set.

COOLDOWN_S = 60.0


class _Renderer:
    """Returns its own marker image, or raises `error` on every call."""

    def __init__(self, name: str, error: Exception | None = None) -> None:
        self.info = AdapterInfo(name=name, model=f"{name}-model", runs_on=RunsOn.PUBLIC_API)
        self.error = error
        self.calls = 0

    def render(self, request: TryOnRequest) -> TryOnResult:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return TryOnResult(image_png=self.info.name.encode())


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _request(png_bytes: bytes) -> TryOnRequest:
    return TryOnRequest(person_image=png_bytes, garment_image=png_bytes, region=TryOnRegion.UPPER)


def _fallback(
    primary: _Renderer, clock: _Clock | None = None
) -> tuple[FallbackRenderer, _Renderer]:
    backup = _Renderer("backup")
    renderer = FallbackRenderer(primary, backup, cooldown_s=COOLDOWN_S, clock=clock or _Clock())
    return renderer, backup


def test_primary_renders_when_it_works(png_bytes: bytes) -> None:
    renderer, backup = _fallback(_Renderer("primary"))

    result = renderer.render(_request(png_bytes))
    assert result.image_png == b"primary"
    assert result.fallback is False
    assert backup.calls == 0


def test_backup_renders_when_the_primary_is_unavailable(png_bytes: bytes) -> None:
    primary = _Renderer("primary", AdapterUnavailable("quota spent"))
    renderer, backup = _fallback(primary)

    result = renderer.render(_request(png_bytes))
    assert result.image_png == b"backup"
    # The app swaps a marked fallback for its own on-device preview
    assert result.fallback is True
    assert (primary.calls, backup.calls) == (1, 1)


def test_primary_is_skipped_during_the_cooldown_and_retried_after(png_bytes: bytes) -> None:
    clock = _Clock()
    primary = _Renderer("primary", AdapterUnavailable("quota spent"))
    renderer, _ = _fallback(primary, clock)
    renderer.render(_request(png_bytes))

    clock.now += COOLDOWN_S - 1
    renderer.render(_request(png_bytes))
    assert primary.calls == 1

    clock.now += 1
    primary.error = None
    assert renderer.render(_request(png_bytes)).image_png == b"primary"
    assert primary.calls == 2


def test_invalid_input_is_not_hidden_by_the_backup(png_bytes: bytes) -> None:
    primary = _Renderer("primary", InvalidInput("no person in the photo"))
    renderer, backup = _fallback(primary)

    with pytest.raises(InvalidInput):
        renderer.render(_request(png_bytes))
    assert backup.calls == 0


def test_info_names_both_and_keeps_the_primary_privacy_level() -> None:
    renderer = FallbackRenderer(_Renderer("hf-space"), OverlayRenderer())

    assert renderer.info.name == "hf-space, overlay as fallback"
    assert renderer.info.runs_on is RunsOn.PUBLIC_API


def test_negative_cooldown_is_rejected() -> None:
    with pytest.raises(ValueError, match="cooldown_s"):
        FallbackRenderer(_Renderer("primary"), _Renderer("backup"), cooldown_s=-1)


@pytest.mark.parametrize("fallback", ["none", "overlay"])
def test_wiring_leaves_the_renderer_alone_without_a_different_fallback(
    fallback: Literal["none", "overlay"],
) -> None:
    settings = Settings(tryon="overlay", tryon_fallback=fallback)

    assert isinstance(_build_renderer(settings), OverlayRenderer)


def test_wiring_wraps_the_renderer_when_a_fallback_is_set() -> None:
    settings = Settings(tryon="hf_space", tryon_fallback="overlay", tryon_fallback_cooldown_s=5)

    renderer = _build_renderer(settings)

    assert isinstance(renderer, FallbackRenderer)
    assert renderer.info.name == "hf-space, overlay as fallback"
