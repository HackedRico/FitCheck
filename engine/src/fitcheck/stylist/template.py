from __future__ import annotations

import re
from collections.abc import Sequence

from fitcheck.domain import (
    AdapterInfo,
    Category,
    ChatTurn,
    Garment,
    RenderAction,
    RunsOn,
    StylistBrief,
    StylistReply,
)
from fitcheck.settings import Settings
from fitcheck.verdict import list_garments

_WORD = re.compile(r"[a-z0-9]+")
# A render request names a way of seeing it, then "with" the garments to see it next to
_RENDER_ASK = re.compile(r"\b(show|see|try|render|picture|look|wear)\b.*\bwith\b", re.IGNORECASE)
# Words that say how to ask, not which garment, so they never decide a match
_FILLER = frozenset(
    [
        "a",
        "an",
        "the",
        "it",
        "my",
        "me",
        "i",
        "with",
        "and",
        "or",
        "on",
        "in",
        "of",
        "to",
        "show",
        "see",
        "try",
        "render",
        "picture",
        "look",
        "like",
        "wear",
        "what",
        "would",
        "how",
        "does",
        "do",
        "can",
        "could",
    ]
)
# A chat answer lists a few garments, not the whole closet
_MAX_LISTED = 3
_MAX_REASONS = 2

# =============================================================================
# Module Overview
# =============================================================================
# `TemplateStylist` answers chat without a model, so the open path works offline and
# the demo never stalls on a slow LLM. It states the verdict headline and up to two
# reasons, lists closet matches when there is no verdict, and asks for a render when
# the owner wants to see the candidate with closet garments they name.


class TemplateStylist:
    """Stylist built from fixed sentences over the brief; it cannot invent anything."""

    info = AdapterInfo(name="template-stylist", license="Apache-2.0", runs_on=RunsOn.THIS_MACHINE)

    def reply(self, brief: StylistBrief, history: Sequence[ChatTurn], message: str) -> StylistReply:
        """Answer `message` from `brief`; earlier turns do not change a template answer."""
        render = _render_request(brief.closet_matches, message)
        sentences: list[str] = []
        if brief.verdict is not None:
            sentences.append(brief.verdict.headline)
            sentences.extend(r.message for r in brief.verdict.reasons[:_MAX_REASONS])
        elif render is None:
            sentences.append(_closet_answer(brief.closet_matches))
        if render is not None:
            sentences.append(f"Showing it with {list_garments(render)}.")
        action = RenderAction(garment_ids=tuple(g.id for g in render)) if render else None
        return StylistReply(text=" ".join(sentences), render=action)


def _closet_answer(matches: Sequence[Garment]) -> str:
    if not matches:
        return "Nothing in your closet matches that."
    return f"From your closet: {list_garments(matches[:_MAX_LISTED])}."


def _render_request(matches: Sequence[Garment], message: str) -> list[Garment] | None:
    """Return the closet garments the owner asked to see the candidate with, if they asked."""
    if not _RENDER_ASK.search(message):
        return None
    asked = set(_WORD.findall(message.lower())) - _FILLER
    scored = [(len(asked & _garment_words(g)), g) for g in matches]
    best = max((score for score, _ in scored), default=0)
    if best == 0:
        return None
    chosen: dict[Category, Garment] = {}
    for score, g in scored:
        # A render shows one garment per body slot, so the first best match per category wins
        if score == best and g.tags.category not in chosen:
            chosen[g.tags.category] = g
    return list(chosen.values())


def _garment_words(garment: Garment) -> set[str]:
    t = garment.tags
    return set(_WORD.findall(f"{t.category} {t.color_family} {t.pattern} {t.description}".lower()))


def build(settings: Settings) -> TemplateStylist:
    """Return the template stylist; it needs no settings."""
    return TemplateStylist()
