from __future__ import annotations

import json
import logging
import re
from collections.abc import Sequence
from typing import Any
from urllib.parse import urlsplit

import httpx
from pydantic import SecretStr

from fitcheck.domain import AdapterInfo, RunsOn
from fitcheck.errors import AdapterUnavailable

log = logging.getLogger(__name__)

_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
# Licenses of the default models and their self-hosted twins, from each Hugging Face card
_LICENSES = {
    "qwen/qwen3-vl-8b-instruct": "Apache-2.0",
    "qwen3-vl:8b-instruct": "Apache-2.0",
    "qwen3-vl:4b-instruct": "Apache-2.0",
    "qwen/qwen3-30b-a3b-instruct-2507": "Apache-2.0",
}
# Hybrid models on some hosts inline their reasoning ahead of the JSON answer
_THINK = re.compile(r"^\s*<think>.*?</think>\s*", re.DOTALL)

Message = dict[str, Any]

# =============================================================================
# Module Overview
# =============================================================================
# A small httpx client for any OpenAI-compatible `/chat/completions` server, shared by
# the tagger and stylist adapters. `ChatClient.complete` asks for `json_schema` output,
# falls back once to `json_object` with the schema in the prompt when a host rejects it,
# and turns every transport or HTTP failure into `AdapterUnavailable` naming the fix.


class ChatClient:
    """Calls one model on an OpenAI-compatible server; never logs the API key."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: SecretStr | None,
        model: str,
        timeout_s: float,
        key_env: str,
        model_env: str,
    ) -> None:
        if urlsplit(base_url).scheme not in ("http", "https"):
            raise AdapterUnavailable(f"Base URL must be http(s), not `{base_url}`.")
        if not model.strip():
            raise AdapterUnavailable(f"Model is empty; set `{model_env}`.")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._key_env = key_env
        self._model_env = model_env
        self._timeout_s = timeout_s
        # Flips after one host 400s on `json_schema`, so later calls skip the doomed attempt
        self._json_schema_ok = True
        headers = {"Authorization": f"Bearer {api_key.get_secret_value()}"} if api_key else {}
        self._client = httpx.Client(base_url=self.base_url, headers=headers, timeout=timeout_s)

    def complete(
        self,
        messages: Sequence[Message],
        *,
        schema: dict[str, Any],
        schema_name: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """Send `messages` and return the reply text, constrained to `schema` where the host can."""
        if not messages:
            raise ValueError("messages must not be empty")
        body: dict[str, Any] = {
            "model": self.model,
            "messages": list(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if self._json_schema_ok:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "schema": schema, "strict": True},
            }
            response = self._post(body)
            if response.status_code != httpx.codes.BAD_REQUEST:
                return self._content(response)
            log.warning(
                "[LLM] %s rejected `json_schema` (%s); retrying with `json_object`.",
                self.base_url,
                _error_text(response),
            )
            self._json_schema_ok = False
        body["messages"] = _with_schema_note(messages, schema)
        body["response_format"] = {"type": "json_object"}
        return self._content(self._post(body))

    def _post(self, body: dict[str, Any]) -> httpx.Response:
        """POST `body` to `/chat/completions`, raising `AdapterUnavailable` if no answer comes."""
        try:
            return self._client.post("/chat/completions", json=body)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            raise AdapterUnavailable(f"Model server {self.base_url} is not reachable.") from exc
        except httpx.TimeoutException as exc:
            raise AdapterUnavailable(
                f"{self.base_url} did not answer within {self._timeout_s:.0f} s; "
                "raise `FITCHECK_LLM_TIMEOUT_S` or retry."
            ) from exc
        except httpx.HTTPError as exc:
            raise AdapterUnavailable(f"Request to {self.base_url} failed: {exc}") from exc

    def _content(self, response: httpx.Response) -> str:
        """Return the first choice's text, or raise `AdapterUnavailable` for an HTTP error."""
        status = response.status_code
        if status in (httpx.codes.UNAUTHORIZED, httpx.codes.FORBIDDEN):
            raise AdapterUnavailable(
                f"{self.base_url} refused the API key ({status}); set `{self._key_env}`."
            )
        if status == httpx.codes.NOT_FOUND:
            raise AdapterUnavailable(
                f"{self.base_url} has no model `{self.model}`; check `{self._model_env}`."
            )
        if status == httpx.codes.TOO_MANY_REQUESTS:
            raise AdapterUnavailable(f"{self.base_url} is rate limiting us (429); retry shortly.")
        if response.is_error:
            raise AdapterUnavailable(f"{self.base_url} answered {status}: {_error_text(response)}")
        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise AdapterUnavailable(f"{self.base_url} sent no `choices[0].message`.") from exc
        if not isinstance(content, str):
            raise AdapterUnavailable(f"{self.base_url} sent a non-text message.")
        return _THINK.sub("", content)


def adapter_info(base_url: str, model: str, runs_on: RunsOn | None) -> AdapterInfo:
    """Describe an adapter on `base_url`, inferring `runs_on` from the host when unset."""
    host = urlsplit(base_url).hostname or base_url
    if runs_on is None:
        runs_on = RunsOn.THIS_MACHINE if host in _LOOPBACK_HOSTS else RunsOn.PUBLIC_API
    return AdapterInfo(
        name=f"openai-compat@{host}",
        model=model,
        license=_LICENSES.get(model.lower(), "see model card"),
        runs_on=runs_on,
    )


def _with_schema_note(messages: Sequence[Message], schema: dict[str, Any]) -> list[Message]:
    """Return `messages` with the JSON schema spelled out in a leading system message."""
    note = f"Answer with one JSON object matching this JSON schema:\n{json.dumps(schema)}"
    out = [dict(m) for m in messages]
    if out[0].get("role") == "system" and isinstance(out[0].get("content"), str):
        out[0]["content"] = f"{out[0]['content']}\n\n{note}"
    else:
        out.insert(0, {"role": "system", "content": note})
    return out


def _error_text(response: httpx.Response) -> str:
    """Return the server's error message, or the start of the raw body."""
    try:
        error = response.json()["error"]
    except (ValueError, KeyError, TypeError):
        return response.text[:200] or response.reason_phrase
    return str(error.get("message", error) if isinstance(error, dict) else error)
