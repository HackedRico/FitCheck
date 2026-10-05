from __future__ import annotations

from collections.abc import Sequence

from fitcheck.domain import AdapterInfo, ChatTurn, RunsOn, StylistBrief, StylistReply
from fitcheck.errors import InvalidInput
from fitcheck.settings import Settings
from fitcheck.snowflake_session import (
    SnowflakeSession,
    completion_text,
    cortex_model_license,
    session_for,
    sql_object_constant,
)
from fitcheck.stylist.prompts import (
    MAX_HISTORY_TURNS,
    MAX_TOKENS,
    STYLIST_SYSTEM_PROMPT,
    TEMPERATURE,
    parse_reply,
    render_brief,
    reply_json_schema,
)

# AI_COMPLETE takes structured output only in its single-string form, so the system
# prompt, FACTS and transcript travel as one prompt; response_format must be a constant
_REPLY_SQL = (
    "SELECT AI_COMPLETE(model => %(model)s, prompt => %(prompt)s, model_parameters => "
    + sql_object_constant({"temperature": TEMPERATURE, "max_tokens": MAX_TOKENS})
    + ", response_format => "
    + sql_object_constant({"type": "json", "schema": reply_json_schema()})
    + ")"
)

# =============================================================================
# Module Overview
# =============================================================================
# `CortexStylist` voices the stylist with an LLM on Snowflake Cortex. Each reply is
# one AI_COMPLETE call carrying `STYLIST_SYSTEM_PROMPT`, the FACTS from `render_brief`
# and the recent chat, under `reply_json_schema` as structured output, read back with
# `parse_reply`. With Cortex Search feeding `closet_matches`, this is the RAG chatbot.


class CortexStylist:
    """The stylist on Cortex AI_COMPLETE; explains the verdict from FACTS and never changes it."""

    def __init__(self, session: SnowflakeSession, model: str) -> None:
        self._session = session
        self._model = model
        self.info = AdapterInfo(
            name="cortex-stylist",
            model=model,
            license=cortex_model_license(model),
            runs_on=RunsOn.SNOWFLAKE,
        )

    def reply(self, brief: StylistBrief, history: Sequence[ChatTurn], message: str) -> StylistReply:
        """Answer `message` using only the facts in `brief`; state the verdict, never change it."""
        if not message.strip():
            raise InvalidInput("message must not be empty")
        prompt = compose_prompt(brief, history, message)
        with self._session.cursor() as cur:
            cur.execute(_REPLY_SQL, {"model": self._model, "prompt": prompt})
            text = completion_text(cur.fetchone())
        return parse_reply(text)


def compose_prompt(brief: StylistBrief, history: Sequence[ChatTurn], message: str) -> str:
    """Write the system prompt, FACTS, recent turns and `message` as one prompt string."""
    lines = [STYLIST_SYSTEM_PROMPT, "", render_brief(brief), "", "CONVERSATION"]
    for turn in history[-MAX_HISTORY_TURNS:]:
        speaker = "Stylist" if turn.role == "stylist" else "User"
        lines.append(f"{speaker}: {turn.text}")
    lines.append(f"User: {message}")
    return "\n".join(lines)


def build(settings: Settings) -> CortexStylist:
    """Return a `CortexStylist` for `settings.cortex_model` on the shared Snowflake session."""
    return CortexStylist(session_for(settings), settings.cortex_model)
