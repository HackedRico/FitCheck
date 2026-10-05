from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image

from fitcheck_worker.app import WorkerConfig, create_app

# =============================================================================
# Module Overview
# =============================================================================
# Tests for the worker's HTTP contract with the `echo` backend: health, the PNG
# answer, the bearer token and input errors.


def _png(size: tuple[int, int], color: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def _files() -> dict[str, tuple[str, bytes, str]]:
    return {
        "person": ("person", _png((120, 240), (90, 90, 90)), "application/octet-stream"),
        "garment": ("garment", _png((40, 40), (200, 30, 30)), "application/octet-stream"),
    }


def _client(token: str | None = None) -> TestClient:
    return TestClient(create_app(WorkerConfig(token=token)))


def test_health_names_the_echo_backend() -> None:
    with _client() as client:
        body = client.get("/health").json()

    assert body == {
        "backend": "echo",
        "model": "pillow-composite",
        "license": "Apache-2.0",
        "device": "cpu",
        "ready": True,
    }


def test_render_returns_a_png_the_size_of_the_person() -> None:
    with _client() as client:
        response = client.post("/render", files=_files(), data={"region": "upper", "seed": "3"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    image = Image.open(io.BytesIO(response.content))
    assert image.size == (120, 240)


def test_render_without_the_token_is_401() -> None:
    with _client(token="s3cret") as client:
        response = client.post("/render", files=_files(), data={"region": "upper"})

    assert response.status_code == 401


def test_render_with_the_token_works() -> None:
    with _client(token="s3cret") as client:
        response = client.post(
            "/render",
            files=_files(),
            data={"region": "lower"},
            headers={"Authorization": "Bearer s3cret"},
        )

    assert response.status_code == 200


def test_bad_region_is_422() -> None:
    with _client() as client:
        response = client.post("/render", files=_files(), data={"region": "hat"})

    assert response.status_code == 422


def test_unreadable_person_is_422() -> None:
    files = _files()
    files["person"] = ("person", b"not an image", "application/octet-stream")
    with _client() as client:
        response = client.post("/render", files=files, data={"region": "upper"})

    assert response.status_code == 422
    assert "person" in response.json()["detail"]


def test_a_malformed_content_length_is_a_client_error() -> None:
    with _client() as client:
        headers = {"content-length": "lots", "content-type": "text/plain"}
        response = client.post("/render", content=b"x", headers=headers)

    assert 400 <= response.status_code < 500
