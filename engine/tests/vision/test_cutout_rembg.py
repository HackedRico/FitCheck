from __future__ import annotations

import importlib.util
import io
from collections.abc import Callable
from typing import Any

import pytest
from PIL import Image

from fitcheck.errors import AdapterUnavailable
from fitcheck.settings import Settings
from fitcheck.vision.cutout_rembg import RembgCutter, build

RGB = tuple[int, int, int]

rembg = pytest.importorskip("rembg", reason="needs the `cutout` extra")


class _FakeRembg:
    """Stands in for `rembg.new_session` and `rembg.remove`, counting session builds."""

    def __init__(self, fail_with: Exception | None = None) -> None:
        self.sessions_built = 0
        self._fail_with = fail_with

    def new_session(self, model_name: str) -> str:
        if self._fail_with is not None:
            raise self._fail_with
        self.sessions_built += 1
        return f"session:{model_name}"

    def remove(self, image: Image.Image, **_: Any) -> Image.Image:
        return image.convert("RGBA")


@pytest.fixture
def fake_rembg(monkeypatch: pytest.MonkeyPatch) -> _FakeRembg:
    fake = _FakeRembg()
    monkeypatch.setattr(rembg, "new_session", fake.new_session)
    monkeypatch.setattr(rembg, "remove", fake.remove)
    return fake


def test_session_is_built_lazily_and_once(fake_rembg: _FakeRembg, png_bytes: bytes) -> None:
    cutter = build(Settings())
    assert fake_rembg.sessions_built == 0

    cutter.cut(png_bytes)
    cutter.cut(png_bytes)

    assert fake_rembg.sessions_built == 1


def test_cut_returns_rgba_png(fake_rembg: _FakeRembg, png_bytes: bytes) -> None:
    out = Image.open(io.BytesIO(RembgCutter().cut(png_bytes)))

    assert (out.format, out.mode) == ("PNG", "RGBA")


def test_failed_weight_download_is_adapter_unavailable(
    monkeypatch: pytest.MonkeyPatch, png_bytes: bytes
) -> None:
    fake = _FakeRembg(fail_with=OSError("network is unreachable"))
    monkeypatch.setattr(rembg, "new_session", fake.new_session)

    with pytest.raises(AdapterUnavailable, match="FITCHECK_CUTOUT=none"):
        RembgCutter().cut(png_bytes)


def test_build_without_extra_names_the_fix(monkeypatch: pytest.MonkeyPatch) -> None:
    real_find_spec = importlib.util.find_spec
    monkeypatch.setattr(
        importlib.util,
        "find_spec",
        lambda name, *a: None if name == "onnxruntime" else real_find_spec(name, *a),
    )

    with pytest.raises(AdapterUnavailable, match="uv sync --extra cutout"):
        build(Settings())


@pytest.mark.live
def test_real_model_clears_the_wall_and_keeps_the_garment(
    garment_photo: Callable[[RGB], bytes],
) -> None:
    out = Image.open(io.BytesIO(RembgCutter().cut(garment_photo((190, 25, 35)))))
    alpha = out.getchannel("A")

    assert out.mode == "RGBA"
    assert alpha.getpixel((10, out.height - 10)) == 0, "wall corner should be transparent"
    assert alpha.getpixel((384, 500)) == 255, "tee body should be opaque"
