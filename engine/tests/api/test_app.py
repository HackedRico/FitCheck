from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from fitcheck.api.app import create_app
from fitcheck.settings import Settings
from fitcheck.wiring import build_engine

# =============================================================================
# Module Overview
# =============================================================================
# Tests for the HTTP layer's own guards: bad query values answer 400 rather than
# 500, and an oversized upload is refused before its body is read.


@pytest.fixture
def client(offline_settings: Settings) -> TestClient:
    return TestClient(create_app(build_engine(offline_settings), offline_settings))


def test_week_answers_for_a_valid_location(client: TestClient) -> None:
    assert client.get("/week/maya", params={"lat": 40.7, "lon": -74.0}).status_code == 200


@pytest.mark.parametrize("lat", [91, -200])
def test_week_refuses_a_latitude_off_the_globe(client: TestClient, lat: float) -> None:
    response = client.get("/week/maya", params={"lat": lat, "lon": 0})
    assert response.status_code == 400
    assert "lat must be within" in response.json()["detail"]


def test_an_oversized_upload_is_refused(client: TestClient) -> None:
    headers = {"content-length": str(26 * 1024 * 1024), "content-type": "application/json"}
    assert client.post("/link", content=b"{}", headers=headers).status_code == 413
