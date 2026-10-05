from __future__ import annotations

import json
import logging
import re
from typing import Any

from fitcheck.domain import Garment, RenderAction, StylistBrief, StylistReply

log = logging.getLogger(__name__)

STYLIST_SYSTEM_PROMPT = (
    "You are FitCheck, a blunt but kind second opinion in a fitting-room line.\n"
    "You receive FACTS: the scanned garment's tags, the verdict and its reasons, closet "
    "items that match the question, and the week's forecast and plans.\n"
    "State the verdict in your first sentence, then give at most two reasons, using the "
    "FACTS only. Never invent closet items, prices or weather. The verdict is final: "
    "explain it, never change it. Ask at most one question per reply.\n"
    'Reply as JSON: {"text": "<your reply>", "render_garment_ids": [<ids>]}. '
    "Fill render_garment_ids only when the user asks to see the scanned garment with "
    "specific closet items, using ids from FACTS; otherwise send an empty list."
)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# Low enough that a rehearsed question gets much the same answer on stage
TEMPERATURE = 0.3
MAX_TOKENS = 400
# Keep only recent turns so a long chat never pushes the FACTS out of the context window
MAX_HISTORY_TURNS = 12

# =============================================================================
# Module Overview
# =============================================================================
# The stylist prompt and reply contract shared by every LLM stylist, so a model behind
# an OpenAI-compatible API and one on Cortex get identical facts and answer in one JSON shape.
# `render_brief` writes the `StylistBrief` as plain text facts; `parse_reply` reads
# the model's JSON back into a `StylistReply`.


def reply_json_schema() -> dict[str, Any]:
    """Return the JSON schema a stylist model must answer in."""
    return {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "render_garment_ids": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["text", "render_garment_ids"],
    }


def render_brief(brief: StylistBrief) -> str:
    """Write every fact in `brief` as compact text lines for the model prompt."""
    lines = ["FACTS"]
    if brief.candidate is not None:
        lines.append(f"Scanned garment: {_describe_tags(brief.candidate.model_dump())}")
    if brief.verdict is not None:
        v = brief.verdict
        lines.append(f"Verdict: {v.decision.value.upper()}. {v.headline}")
        lines.extend(f"Reason: {r.message}" for r in v.reasons)
        if v.best_pairing is not None:
            lines.append(f"Best pairing: {_describe_garment(v.best_pairing)}")
    if brief.closet_matches:
        lines.append("Closet items matching the question:")
        lines.extend(f"- {_describe_garment(g)}" for g in brief.closet_matches)
    if brief.week is not None and brief.week.forecast is not None:
        for day in brief.week.forecast.days:
            lines.append(
                f"Forecast {day.day.isoformat()}: {day.temp_min_c:.0f} to {day.temp_max_c:.0f} C, "
                f"{day.precipitation_mm:.1f} mm rain"
            )
    if brief.week is not None:
        for event in brief.week.events:
            dress = f", dress code {event.formality}/5" if event.formality else ""
            lines.append(f"Plan {event.start:%a %d %b %H:%M}: {event.title}{dress}")
    return "\n".join(lines)


def parse_reply(text: str) -> StylistReply:
    """Read the model's JSON reply; fall back to the raw text when it is not JSON."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        data = json.loads(cleaned)
        reply_text = str(data["text"]).strip()
        ids = tuple(str(i) for i in data.get("render_garment_ids") or ())
    except (json.JSONDecodeError, KeyError, TypeError):
        log.warning("[Stylist] Model reply was not the expected JSON; using it as plain text.")
        return StylistReply(text=text.strip())
    return StylistReply(text=reply_text, render=RenderAction(garment_ids=ids) if ids else None)


def _describe_garment(garment: Garment) -> str:
    worn = f", worn {garment.wears} times" if garment.wears else ""
    price = f", paid {garment.price}" if garment.price is not None else ""
    return f"[id {garment.id}] {_describe_tags(garment.tags.model_dump())}{worn}{price}"


def _describe_tags(tags: dict[str, Any]) -> str:
    water = "waterproof" if tags["waterproof"] else "not waterproof"
    return (
        f"{tags['color_family']} {tags['pattern']} {tags['category']}, {tags['description']} "
        f"(warmth {tags['warmth']}/5, formality {tags['formality']}/5, {water})"
    )
