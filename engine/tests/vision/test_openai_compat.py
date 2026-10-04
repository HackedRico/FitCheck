from __future__ import annotations

import json
import os
import time
from collections.abc import Callable
from typing import Any

import httpx
import pytest
import respx
from pydantic import SecretStr

from fitcheck.domain import Category, ColorFamily, RunsOn
from fitcheck.errors import AdapterUnavailable, TaggingFailed
from fitcheck.settings import Settings
from fitcheck.vision.openai_compat import build

RGB = tuple[int, int, int]

BASE = "https://llm.test/v1"
URL = f"{BASE}/chat/completions"
NAVY_SWEATER = {
    "category": "sweater",
    "color_family": "navy",
    "pattern": "solid",
    "warmth": 4,
    "waterproof": False,
    "formality": 3,
    "description": "navy wool crew-neck sweater",
}


def _answer(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def _settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "vision_base_url": BASE,
        "vision_api_key": SecretStr("sk-test"),
        "vision_model": "Qwen/Qwen3-VL-8B-Instruct",
        **overrides,
    }
    return Settings(**values)


def _body(call: Any) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(call.request.content)
    return body


@respx.mock
def test_success_sends_image_and_schema(png_bytes: bytes) -> None:
    route = respx.post(URL).mock(return_value=_answer(json.dumps(NAVY_SWEATER)))

    tags = build(_settings()).tag(png_bytes)

    assert (tags.category, tags.color_family) == (Category.SWEATER, ColorFamily.NAVY)
    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer sk-test"
    body = _body(route.calls.last)
    assert body["response_format"]["type"] == "json_schema"
    image_part = body["messages"][0]["content"][1]
    assert image_part["image_url"]["url"].startswith("data:image/jpeg;base64,")


@respx.mock
def test_json_schema_rejected_falls_back_to_json_object(png_bytes: bytes) -> None:
    route = respx.post(URL).mock(
        side_effect=[
            httpx.Response(400, json={"error": {"message": "json_schema unsupported"}}),
            _answer(json.dumps(NAVY_SWEATER)),
        ]
    )

    assert build(_settings()).tag(png_bytes).category is Category.SWEATER
    fallback = _body(route.calls[1])
    assert fallback["response_format"] == {"type": "json_object"}
    assert "JSON schema" in fallback["messages"][0]["content"]


@respx.mock
def test_malformed_then_valid_retries_with_the_error(png_bytes: bytes) -> None:
    route = respx.post(URL).mock(
        side_effect=[_answer("a navy sweater"), _answer(json.dumps(NAVY_SWEATER))]
    )

    assert build(_settings()).tag(png_bytes).color_family is ColorFamily.NAVY
    retry = _body(route.calls[1])["messages"]
    assert retry[1] == {"role": "assistant", "content": "a navy sweater"}
    assert "invalid" in retry[2]["content"]


@respx.mock
def test_two_malformed_answers_raise_tagging_failed(png_bytes: bytes) -> None:
    respx.post(URL).mock(side_effect=[_answer("nope"), _answer('{"category": "hat"}')])

    with pytest.raises(TaggingFailed):
        build(_settings()).tag(png_bytes)


@respx.mock
def test_401_names_the_key_variable(png_bytes: bytes) -> None:
    respx.post(URL).mock(return_value=httpx.Response(401, json={"error": "bad key"}))

    with pytest.raises(AdapterUnavailable, match="FITCHECK_VISION_API_KEY") as caught:
        build(_settings()).tag(png_bytes)
    assert "sk-test" not in str(caught.value)


@respx.mock
def test_timeout_is_adapter_unavailable(png_bytes: bytes) -> None:
    respx.post(URL).mock(side_effect=httpx.ReadTimeout("slow"))

    with pytest.raises(AdapterUnavailable, match="FITCHECK_LLM_TIMEOUT_S"):
        build(_settings()).tag(png_bytes)


@pytest.mark.parametrize(
    ("base_url", "setting", "expected"),
    [
        ("http://localhost:11434/v1", None, RunsOn.THIS_MACHINE),
        ("http://127.0.0.1:8000/v1", None, RunsOn.THIS_MACHINE),
        ("https://api.featherless.ai/v1", None, RunsOn.PUBLIC_API),
        ("http://gpu.lan:8000/v1", RunsOn.SELF_HOSTED_GPU, RunsOn.SELF_HOSTED_GPU),
    ],
)
def test_runs_on_inference(base_url: str, setting: RunsOn | None, expected: RunsOn) -> None:
    info = build(_settings(vision_base_url=base_url, vision_runs_on=setting)).info

    assert info.runs_on is expected
    assert info.license == "Apache-2.0"


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("FITCHECK_VISION_API_KEY"), reason="no vision API key")
def test_live_provider_tags_a_red_tee(garment_photo: Callable[[RGB], bytes]) -> None:
    tags = build(Settings()).tag(garment_photo((190, 25, 35)))

    assert tags.color_family is ColorFamily.RED


@pytest.mark.live
def test_live_own_ollama_tags_a_red_tee(garment_photo: Callable[[RGB], bytes]) -> None:
    settings = Settings(
        vision_base_url="http://localhost:11434/v1",
        vision_api_key=None,
        vision_model=os.environ.get("FITCHECK_LIVE_OLLAMA_MODEL", "qwen3-vl:8b-instruct"),
        llm_timeout_s=300,
    )
    tagger = build(settings)
    photo = garment_photo((190, 25, 35))
    tagger.tag(photo)  # loads the model
    start = time.perf_counter()

    tags = tagger.tag(photo)

    print(f"\n{settings.vision_model} warm: {time.perf_counter() - start:.1f} s -> {tags}")
    assert tags.category in (Category.TOP, Category.SHIRT)
    assert tags.color_family is ColorFamily.RED
    assert tagger.info.runs_on is RunsOn.THIS_MACHINE
