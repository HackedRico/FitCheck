from __future__ import annotations

import httpx
import pytest
import respx
from pydantic import SecretStr

from fitcheck.domain import RunsOn, TryOnRegion, TryOnRequest
from fitcheck.errors import AdapterUnavailable, InvalidInput
from fitcheck.settings import Settings
from fitcheck.tryon.remote import RemoteRenderer, build

# =============================================================================
# Module Overview
# =============================================================================
# Tests for `RemoteRenderer` against a respx-mocked worker: the multipart wire format,
# bearer token, `/health`-driven `info`, and how each failure maps to our errors.

WORKER = "https://worker.example"
RENDER_URL = f"{WORKER}/render"
HEALTH_URL = f"{WORKER}/health"
FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"rendered"


@pytest.fixture
def request_(png_bytes: bytes) -> TryOnRequest:
    return TryOnRequest(
        person_image=png_bytes, garment_image=png_bytes, region=TryOnRegion.LOWER, seed=7
    )


def _renderer(token: str | None = "s3cret", timeout_s: float = 180.0) -> RemoteRenderer:
    return RemoteRenderer(
        WORKER + "/",
        token=SecretStr(token) if token else None,
        timeout_s=timeout_s,
    )


@respx.mock
def test_render_posts_multipart_with_bearer_token_and_returns_png(
    request_: TryOnRequest,
) -> None:
    route = respx.post(RENDER_URL).mock(
        return_value=httpx.Response(200, content=FAKE_PNG, headers={"content-type": "image/png"})
    )

    result = _renderer().render(request_)

    assert result.image_png == FAKE_PNG
    sent = route.calls.last.request
    assert sent.headers["authorization"] == "Bearer s3cret"
    body = sent.content
    assert b'name="person"' in body
    assert b'name="garment"' in body
    assert b'name="region"\r\n\r\nlower' in body
    assert b'name="seed"\r\n\r\n7' in body


@respx.mock
def test_render_without_token_sends_no_authorization(request_: TryOnRequest) -> None:
    route = respx.post(RENDER_URL).mock(return_value=httpx.Response(200, content=FAKE_PNG))

    _renderer(token=None).render(request_)

    assert "authorization" not in route.calls.last.request.headers


@respx.mock
def test_401_raises_adapter_unavailable_naming_the_token_var(request_: TryOnRequest) -> None:
    respx.post(RENDER_URL).mock(
        return_value=httpx.Response(401, json={"detail": "Missing or wrong bearer token."})
    )

    with pytest.raises(AdapterUnavailable, match="FITCHECK_TRYON_WORKER_TOKEN"):
        _renderer().render(request_)


@respx.mock
def test_timeout_raises_adapter_unavailable_naming_the_timeout_var(
    request_: TryOnRequest,
) -> None:
    respx.post(RENDER_URL).mock(side_effect=httpx.ReadTimeout("slow"))

    with pytest.raises(AdapterUnavailable, match="FITCHECK_TRYON_TIMEOUT_S"):
        _renderer(timeout_s=1).render(request_)


@respx.mock
def test_worker_down_raises_adapter_unavailable_naming_the_url_var(
    request_: TryOnRequest,
) -> None:
    respx.post(RENDER_URL).mock(side_effect=httpx.ConnectError("refused"))

    with pytest.raises(AdapterUnavailable, match="FITCHECK_TRYON_WORKER_URL"):
        _renderer().render(request_)


def test_unset_url_raises_adapter_unavailable_naming_the_url_var(
    request_: TryOnRequest,
) -> None:
    renderer = RemoteRenderer(None)

    with pytest.raises(AdapterUnavailable, match="FITCHECK_TRYON_WORKER_URL"):
        renderer.render(request_)


def test_malformed_url_is_rejected_up_front() -> None:
    with pytest.raises(AdapterUnavailable, match="FITCHECK_TRYON_WORKER_URL"):
        RemoteRenderer("worker.example:8000")


@respx.mock
def test_422_from_worker_is_the_callers_problem(request_: TryOnRequest) -> None:
    respx.post(RENDER_URL).mock(
        return_value=httpx.Response(422, json={"detail": "No person found in the photo."})
    )

    with pytest.raises(InvalidInput, match="No person found"):
        _renderer().render(request_)


@respx.mock
def test_503_while_warming_up_raises_adapter_unavailable(request_: TryOnRequest) -> None:
    respx.post(RENDER_URL).mock(
        return_value=httpx.Response(503, json={"detail": "Model is still loading."})
    )

    with pytest.raises(AdapterUnavailable, match="still loading"):
        _renderer().render(request_)


@respx.mock
def test_non_png_answer_raises_adapter_unavailable(request_: TryOnRequest) -> None:
    respx.post(RENDER_URL).mock(return_value=httpx.Response(200, text="<html>tunnel</html>"))

    with pytest.raises(AdapterUnavailable, match="without a PNG"):
        _renderer().render(request_)


@respx.mock
def test_info_reads_model_and_license_from_health_and_caches_it() -> None:
    health = respx.get(HEALTH_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "backend": "leffa",
                "model": "franciszzj/Leffa virtual_tryon.pth",
                "license": "MIT",
                "device": "cuda",
                "ready": True,
            },
        )
    )
    renderer = _renderer()

    first = renderer.info
    second = renderer.info

    assert first.name == "worker-leffa"
    assert first.model == "franciszzj/Leffa virtual_tryon.pth"
    assert first.license == "MIT"
    assert first.runs_on is RunsOn.SELF_HOSTED_GPU
    assert second == first
    assert health.call_count == 1


@respx.mock
def test_info_falls_back_when_the_worker_is_down() -> None:
    respx.get(HEALTH_URL).mock(side_effect=httpx.ConnectError("refused"))

    info = _renderer().info

    assert info.name == "remote-worker"
    assert info.model is None
    assert info.runs_on is RunsOn.SELF_HOSTED_GPU


@respx.mock
def test_build_reads_url_and_token_from_settings(request_: TryOnRequest) -> None:
    route = respx.post(RENDER_URL).mock(return_value=httpx.Response(200, content=FAKE_PNG))
    settings = Settings(
        tryon="remote", tryon_worker_url=WORKER, tryon_worker_token=SecretStr("from-env")
    )

    build(settings).render(request_)

    assert route.calls.last.request.headers["authorization"] == "Bearer from-env"
