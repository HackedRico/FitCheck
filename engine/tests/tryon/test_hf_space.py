from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from gradio_client.exceptions import AppError
from PIL import Image

from fitcheck.domain import RunsOn, TryOnRegion, TryOnRequest
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.tryon.hf_space import HfSpaceRenderer

# =============================================================================
# Module Overview
# =============================================================================
# Tests for `HfSpaceRenderer` with a fake Gradio client: the arguments sent to the
# Leffa Space, the temp files holding the person photo being gone after every call
# (ADR 0003), and the error mapping. One `live` test calls the real Space.

SPACE = "franciszzj/Leffa"
OUTPUT_URL = "https://franciszzj-leffa.hf.space/gradio_api/file=/tmp/gradio/abc/image.webp"
# Public VITON-HD samples that the Leffa model repo ships as examples, not anyone's private photo
EXAMPLES = "https://huggingface.co/franciszzj/Leffa/resolve/main/examples"


def _webp() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (48, 64), (10, 120, 200)).save(buffer, format="WEBP")
    return buffer.getvalue()


def _file_data(url: str) -> dict[str, Any]:
    """An output file as a Gradio 5 Space returns it when the client skips downloads."""
    return {"path": "/tmp/gradio/abc/image.webp", "url": url, "meta": {"_type": "gradio.FileData"}}


class _FakeJob:
    def __init__(self, outcome: Any) -> None:
        self._outcome = outcome
        self.cancelled = False

    def result(self, timeout: float | None = None) -> Any:
        if isinstance(outcome := self._outcome, BaseException):
            raise outcome
        return outcome

    def cancel(self) -> bool:
        self.cancelled = True
        return True


class _FakeClient:
    """Records each submit, including whether the uploaded files existed at that moment."""

    def __init__(self, outcome: Any) -> None:
        self.headers: dict[str, str] = {}
        self.job = _FakeJob(outcome)
        self.args: tuple[Any, ...] = ()
        self.api_name: str | None = None
        self.uploads: list[tuple[Path, bytes]] = []

    def submit(self, *args: Any, api_name: str) -> _FakeJob:
        self.args = args
        self.api_name = api_name
        self.uploads = [(Path(a["path"]), Path(a["path"]).read_bytes()) for a in args[:2]]
        return self.job


def _renderer(client: _FakeClient, timeout_s: float = 180.0) -> HfSpaceRenderer:
    return HfSpaceRenderer(SPACE, timeout_s=timeout_s, client_factory=lambda _: client)


def _request(png_bytes: bytes, region: TryOnRegion = TryOnRegion.UPPER) -> TryOnRequest:
    garment = png_bytes + b"garment"
    return TryOnRequest(person_image=png_bytes, garment_image=garment, region=region, seed=3)


@respx.mock
def test_render_returns_png_and_deletes_the_person_photo(png_bytes: bytes) -> None:
    respx.get(OUTPUT_URL).mock(return_value=httpx.Response(200, content=_webp()))
    client = _FakeClient((_file_data(OUTPUT_URL), _file_data("m"), _file_data("d")))
    request = _request(png_bytes)

    result = _renderer(client).render(request)

    rendered = Image.open(io.BytesIO(result.image_png))
    assert rendered.format == "PNG"
    assert rendered.size == (48, 64)
    (person_path, person_sent), (garment_path, garment_sent) = client.uploads
    assert person_sent == request.person_image
    assert garment_sent == request.garment_image
    assert not person_path.exists()
    assert not person_path.parent.exists()
    assert not garment_path.exists()


@respx.mock
def test_region_picks_the_leffa_model_and_garment_type(png_bytes: bytes) -> None:
    respx.get(OUTPUT_URL).mock(return_value=httpx.Response(200, content=_webp()))
    client = _FakeClient((_file_data(OUTPUT_URL),))

    _renderer(client).render(_request(png_bytes, TryOnRegion.LOWER))

    assert client.api_name == "/leffa_predict_vt"
    ref_acceleration, steps, scale, seed, model, garment_type, repaint = client.args[2:]
    assert (model, garment_type) == ("dress_code", "lower_body")
    assert seed == 3
    # The Space's radios hold real booleans; the strings "True" and "False" are rejected
    assert ref_acceleration is False
    assert repaint is False
    assert (steps, scale) == (30, 2.5)


def test_quota_error_raises_adapter_unavailable_and_deletes_temp_files(png_bytes: bytes) -> None:
    client = _FakeClient(
        AppError(
            "You have exceeded your ZeroGPU quota (180s requested vs. 174s left). "
            "Try again in 23:59:39."
        )
    )

    with pytest.raises(AdapterUnavailable, match="HF_TOKEN"):
        _renderer(client).render(_request(png_bytes))

    assert all(not path.exists() for path, _ in client.uploads)


def test_timeout_cancels_the_job_and_deletes_temp_files(png_bytes: bytes) -> None:
    client = _FakeClient(TimeoutError())

    with pytest.raises(AdapterUnavailable, match="FITCHECK_TRYON_TIMEOUT_S"):
        _renderer(client, timeout_s=1).render(_request(png_bytes))

    assert client.job.cancelled
    assert all(not path.exists() for path, _ in client.uploads)


def test_no_person_in_photo_raises_invalid_input(png_bytes: bytes) -> None:
    client = _FakeClient(AppError("IndexError"))

    with pytest.raises(InvalidInput, match="no person"):
        _renderer(client).render(_request(png_bytes))


def test_unreachable_space_raises_adapter_unavailable(png_bytes: bytes) -> None:
    def refuse(space: str) -> Any:
        raise ValueError(f"Could not fetch config for {space}")

    renderer = HfSpaceRenderer(SPACE, client_factory=refuse)

    with pytest.raises(AdapterUnavailable, match="FITCHECK_TRYON_HF_SPACE"):
        renderer.render(_request(png_bytes))


def test_unexpected_output_shape_raises_adapter_unavailable(png_bytes: bytes) -> None:
    client = _FakeClient(("/tmp/gradio/abc/image.webp",))

    with pytest.raises(AdapterUnavailable, match="unexpected shape"):
        _renderer(client).render(_request(png_bytes))


def test_info_says_the_photo_goes_to_a_public_api() -> None:
    renderer = HfSpaceRenderer(SPACE, client_factory=lambda _: _FakeClient(None))

    assert renderer.info.runs_on is RunsOn.PUBLIC_API
    assert SPACE in (renderer.info.model or "")


@pytest.mark.live
def test_live_space_renders_the_example_pair() -> None:
    person = httpx.get(f"{EXAMPLES}/person1/01350_00.jpg", follow_redirects=True).content
    garment = httpx.get(f"{EXAMPLES}/garment/01449_00.jpg", follow_redirects=True).content
    request = TryOnRequest(person_image=person, garment_image=garment, region=TryOnRegion.UPPER)

    result = HfSpaceRenderer(SPACE).render(request)

    assert Image.open(io.BytesIO(result.image_png)).format == "PNG"


def test_token_from_settings_reaches_the_space_client(monkeypatch: pytest.MonkeyPatch) -> None:
    """engine/.env never reaches os.environ, so the token must travel through Settings."""
    from fitcheck.settings import Settings
    from fitcheck.tryon import hf_space

    seen: dict[str, object] = {}

    class _Client:
        def __init__(self, space: str, **kwargs: object) -> None:
            seen.update(kwargs, space=space)

    monkeypatch.setitem(
        __import__("sys").modules, "gradio_client", type("m", (), {"Client": _Client})
    )
    renderer = hf_space.build(Settings(hf_token="hf_test_token", tryon_hf_space="someone/space"))
    renderer._client_factory("someone/space")
    assert seen["token"] == "hf_test_token"
    assert seen["space"] == "someone/space"
