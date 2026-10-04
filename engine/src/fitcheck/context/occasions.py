from __future__ import annotations

import re

# Dress code per keyword, 1 = gym, 5 = black tie. Phrases match as whole words, any case.
_KEYWORDS_BY_FORMALITY: dict[int, tuple[str, ...]] = {
    5: ("wedding", "gala", "black tie", "formal"),
    4: ("interview", "client meeting", "office"),
    3: ("dinner", "date", "party", "presentation"),
    2: ("brunch", "drinks", "coffee"),
    1: ("gym", "run", "climbing"),
}

# =============================================================================
# Module Overview
# =============================================================================
# Turns a calendar event title into an occasion's dress code. `infer_formality` reads
# the title against a keyword table and returns 1 to 5, or `None` when no keyword
# appears. Every calendar adapter calls it, so all of them grade titles the same way.


def _phrase_pattern(phrase: str) -> str:
    """Escape `phrase` and let its spaces also match hyphens, so "black-tie" counts."""
    return r"[\s-]+".join(re.escape(word) for word in phrase.split())


def _level_pattern(phrases: tuple[str, ...]) -> re.Pattern[str]:
    alternatives = "|".join(_phrase_pattern(p) for p in phrases)
    return re.compile(rf"\b(?:{alternatives})\b", re.IGNORECASE)


# Highest level first, so the first hit is the strictest dress code in the title
_PATTERNS: tuple[tuple[int, re.Pattern[str]], ...] = tuple(
    (level, _level_pattern(phrases))
    for level, phrases in sorted(_KEYWORDS_BY_FORMALITY.items(), reverse=True)
)


def infer_formality(title: str) -> int | None:
    """Return the dress code 1 to 5 implied by `title`, or `None` when no keyword matches."""
    for level, pattern in _PATTERNS:
        if pattern.search(title):
            return level
    return None
