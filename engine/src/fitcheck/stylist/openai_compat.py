from __future__ import annotations

import json
from collections.abc import Sequence

from fitcheck.domain import ChatTurn, StylistBrief, StylistReply
from fitcheck.errors import InvalidInput
from fitcheck.openai_compat import ChatClient, Message, adapter_info
from fitcheck.settings import Settings
from fitcheck.stylist.prompts import (
    MAX_HISTORY_TURNS,
    MAX_TOKENS,
    STYLIST_SYSTEM_PROMPT,
    TEMPERATURE,
    parse_reply,
    render_brief,
    reply_json_schema,
)

_RETRY_NOTE = 'Reply again as JSON only: {"text": "...", "render_garment_ids": [...]}.'

# =============================================================================
# Module Overview
# =============================================================================
# `OpenAICompatStylist` voices the stylist with an open-weight chat model on any
# OpenAI-compatible server. It sends `STYLIST_SYSTEM_PROMPT` plus `render_brief`
# FACTS, recent turns and the message under `reply_json_schema`, retries once when
# the answer is not that JSON, then lets `parse_reply` fall back to plain text.


class OpenAICompatStylist:
    """The stylist on an OpenAI-compatible chat model; explains the verdict, never changes it."""

    def __init__(self, client: ChatClient, settings: Settings) -> None:
        self._client = client
        self._schema = reply_json_schema()
        self.info = adapter_info(client.base_url, client.model, settings.chat_runs_on)

    def reply(self, brief: StylistBrief, history: Sequence[ChatTurn], message: str) -> StylistReply:
        """Answer `message` using only the facts in `brief`; state the verdict, never change it."""
        if not message.strip():
            raise InvalidInput("message must not be empty")
        messages: list[Message] = [
            {"role": "system", "content": f"{STYLIST_SYSTEM_PROMPT}\n\n{render_brief(brief)}"}
        ]
        messages += [
            {"role": "assistant" if t.role == "stylist" else "user", "content": t.text}
            for t in history[-MAX_HISTORY_TURNS:]
        ]
        messages.append({"role": "user", "content": message})
        text = self._ask(messages)
        if not _is_reply_json(text):
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": _RETRY_NOTE},
            ]
            text = self._ask(messages)
        return parse_reply(text)

    def _ask(self, messages: list[Message]) -> str:
        return self._client.complete(
            messages,
            schema=self._schema,
            schema_name="stylist_reply",
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
        )


def _is_reply_json(text: str) -> bool:
    """Return whether `text` is a JSON object with a string `text` field, fences allowed."""
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return False
    return isinstance(data, dict) and isinstance(data.get("text"), str)


def build(settings: Settings) -> OpenAICompatStylist:
    """Return an `OpenAICompatStylist` for the `chat_*` settings."""
    client = ChatClient(
        base_url=settings.chat_base_url,
        api_key=settings.chat_api_key,
        model=settings.chat_model,
        timeout_s=settings.llm_timeout_s,
        key_env="FITCHECK_CHAT_API_KEY",
        model_env="FITCHECK_CHAT_MODEL",
    )
    return OpenAICompatStylist(client, settings)
