from __future__ import annotations

import json
import os
from typing import Any

import httpx
import pytest
import respx
from pydantic import SecretStr

from fitcheck.domain import ChatTurn, StylistBrief
from fitcheck.errors import AdapterUnavailable
from fitcheck.settings import Settings
from fitcheck.stylist.openai_compat import build
from fitcheck.stylist.prompts import STYLIST_SYSTEM_PROMPT

BASE = "https://llm.test/v1"
URL = f"{BASE}/chat/completions"
GOOD = json.dumps({"text": "Skip it: you own two navy sweaters.", "render_garment_ids": ["g1"]})


def _answer(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def _settings() -> Settings:
    return Settings(chat_base_url=BASE, chat_api_key=SecretStr("sk-test"), chat_model="m")


def _body(call: Any) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(call.request.content)
    return body


@respx.mock
def test_success_sends_facts_history_and_message() -> None:
    route = respx.post(URL).mock(return_value=_answer(GOOD))
    history = [ChatTurn(role="user", text="hi"), ChatTurn(role="stylist", text="hello")]

    reply = build(_settings()).reply(StylistBrief(), history, "should I buy it?")

    assert reply.text.startswith("Skip it")
    assert reply.render is not None and reply.render.garment_ids == ("g1",)
    messages = _body(route.calls.last)["messages"]
    assert messages[0]["content"].startswith(STYLIST_SYSTEM_PROMPT)
    assert "FACTS" in messages[0]["content"]
    assert [m["role"] for m in messages[1:]] == ["user", "assistant", "user"]


@respx.mock
def test_think_block_is_stripped() -> None:
    respx.post(URL).mock(return_value=_answer(f"<think>hmm</think>\n{GOOD}"))

    assert build(_settings()).reply(StylistBrief(), [], "ok?").text.startswith("Skip it")


@respx.mock
def test_malformed_then_valid_retries_once() -> None:
    route = respx.post(URL).mock(side_effect=[_answer("Skip it."), _answer(GOOD)])

    reply = build(_settings()).reply(StylistBrief(), [], "ok?")

    assert route.call_count == 2
    assert reply.render is not None


@respx.mock
def test_two_malformed_replies_fall_back_to_plain_text() -> None:
    respx.post(URL).mock(side_effect=[_answer("Skip it."), _answer("Really, skip it.")])

    reply = build(_settings()).reply(StylistBrief(), [], "ok?")

    assert (reply.text, reply.render) == ("Really, skip it.", None)


@respx.mock
def test_json_schema_rejected_falls_back_to_json_object() -> None:
    route = respx.post(URL).mock(side_effect=[httpx.Response(400, text="nope"), _answer(GOOD)])

    build(_settings()).reply(StylistBrief(), [], "ok?")

    assert _body(route.calls[1])["response_format"] == {"type": "json_object"}


@respx.mock
def test_401_names_the_key_variable() -> None:
    respx.post(URL).mock(return_value=httpx.Response(403))

    with pytest.raises(AdapterUnavailable, match="FITCHECK_CHAT_API_KEY"):
        build(_settings()).reply(StylistBrief(), [], "ok?")


@respx.mock
def test_timeout_is_adapter_unavailable() -> None:
    respx.post(URL).mock(side_effect=httpx.ConnectError("refused"))

    with pytest.raises(AdapterUnavailable, match="not reachable"):
        build(_settings()).reply(StylistBrief(), [], "ok?")


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("FITCHECK_CHAT_API_KEY"), reason="no chat API key")
def test_live_provider_replies() -> None:
    reply = build(Settings()).reply(StylistBrief(), [], "Say hello in five words.")

    assert reply.text
