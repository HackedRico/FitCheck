from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from fitcheck.domain import (
    CalendarEvent,
    Category,
    ColorFamily,
    DayForecast,
    Decision,
    Garment,
    GarmentTags,
    Pattern,
    Reason,
    ReasonCode,
    Verdict,
    WeekContext,
)

# Buying a third garment that close to two you own adds nothing
_SKIP_AT_DUPLICATES = 2
# A garment that goes with this many things earns its place without filling a gap
_VERSATILE_AT_PAIRINGS = 3

# A wet day by rain amount or by forecast chance, whichever the source reports
_WET_DAY_MM = 1.0
_WET_DAY_CHANCE = 60
# One wet day is an umbrella; two or more is a raincoat
_RAIN_GAP_AT_WET_DAYS = 2

# A day this cold or colder needs a coat rated warmth 4 or more
_COLD_DAY_C = 5.0
_WARM_COAT_AT_WARMTH = 4

# Categories worn together; listed once per pair, read both ways
_WORN_TOGETHER: tuple[tuple[Category, Category], ...] = (
    (Category.TOP, Category.BOTTOM),
    (Category.TOP, Category.OUTERWEAR),
    (Category.TOP, Category.SHOES),
    (Category.SWEATER, Category.BOTTOM),
    (Category.SWEATER, Category.OUTERWEAR),
    (Category.SWEATER, Category.SHOES),
    (Category.SWEATER, Category.SHIRT),
    (Category.SWEATER, Category.DRESS),
    (Category.SHIRT, Category.BOTTOM),
    (Category.SHIRT, Category.OUTERWEAR),
    (Category.SHIRT, Category.SHOES),
    (Category.OUTERWEAR, Category.DRESS),
    (Category.OUTERWEAR, Category.BOTTOM),
    (Category.DRESS, Category.SHOES),
    (Category.BOTTOM, Category.SHOES),
    *((Category.ACCESSORY, c) for c in Category if c is not Category.ACCESSORY),
)

# Stripes and checks read as basics; these prints are what people call loud
_BOLD_PATTERNS = frozenset({Pattern.FLORAL, Pattern.GRAPHIC, Pattern.OTHER})

# An occasion at this dress code or above needs something bought for it
_FORMAL_EVENT_AT = 4

# Read as "you have no <noun> dressy enough"
_NOUN: dict[Category, str] = {
    Category.TOP: "top",
    Category.SWEATER: "sweater",
    Category.SHIRT: "shirt",
    Category.OUTERWEAR: "jacket",
    Category.DRESS: "dress",
    Category.BOTTOM: "trousers or skirt",
    Category.SHOES: "shoes",
    Category.ACCESSORY: "accessory",
}

_PLURAL: dict[Category, str] = {
    Category.TOP: "tops",
    Category.SWEATER: "sweaters",
    Category.SHIRT: "shirts",
    Category.OUTERWEAR: "jackets",
    Category.DRESS: "dresses",
    Category.BOTTOM: "bottoms",
    Category.SHOES: "pairs of shoes",
    Category.ACCESSORY: "accessories",
}

# =============================================================================
# Module Overview
# =============================================================================
# The verdict rules: plain, deterministic code decides BUY, SKIP or TRY_WITH so the
# demo repeats exactly, and the stylist model only explains the result. `decide` is
# the whole interface; it is pure, with no I/O and no clock of its own. The rules are
# written out for people in `docs/verdict-rules.md`; keep the two in step.


def decide(
    candidate: GarmentTags, closet: Sequence[Garment], week: WeekContext, today: date
) -> Verdict:
    """Return the verdict for buying `candidate` given `closet` and the coming `week`."""
    pairings = _rank_pairings(candidate, closet)
    gaps = _gaps_filled(candidate, closet, week, today)
    # Nothing owned covers a filled gap, so nothing owned can be a duplicate of the candidate
    if gaps:
        return Verdict(
            decision=Decision.BUY,
            headline=f"Buy it: {gaps[0].headline}.",
            reasons=(*(g.reason for g in gaps), _pairings_reason(pairings)),
            pairings=pairings,
            best_pairing=pairings[0] if pairings else None,
        )
    duplicates = tuple(g for g in closet if _is_duplicate(candidate, g.tags))
    if len(duplicates) >= _SKIP_AT_DUPLICATES:
        return Verdict(
            decision=Decision.SKIP,
            headline=(
                f"Skip it: you already own {len(duplicates)} "
                f"{_color_word(candidate.color_family)} {_PLURAL[candidate.category]} "
                "like this one."
            ),
            reasons=(_duplicates_reason(duplicates),),
            duplicates=duplicates,
        )
    statement = _is_statement(candidate)
    if not duplicates and not statement and len(pairings) >= _VERSATILE_AT_PAIRINGS:
        return Verdict(
            decision=Decision.BUY,
            headline=(
                f"Buy it: it goes with {len(pairings)} things you own and you have nothing like it."
            ),
            reasons=(_pairings_reason(pairings),),
            pairings=pairings,
            best_pairing=pairings[0],
        )
    if not pairings:
        return Verdict(
            decision=Decision.SKIP,
            headline="Skip it: nothing you own goes with it.",
            reasons=(_pairings_reason(pairings),),
            duplicates=duplicates,
        )
    reasons = (
        *((_duplicates_reason(duplicates),) if duplicates else ()),
        *((_STATEMENT_REASON,) if statement else ()),
        _pairings_reason(pairings),
    )
    caveat = _caveat(duplicates, statement, pairings)
    return Verdict(
        decision=Decision.TRY_WITH,
        headline=f"Try it with your {phrase(pairings[0])}: {caveat}.",
        reasons=reasons,
        duplicates=duplicates,
        pairings=pairings,
        best_pairing=pairings[0],
    )


# =============================================================================
# Rules
# =============================================================================


def _is_duplicate(candidate: GarmentTags, owned: GarmentTags) -> bool:
    return (
        owned.category == candidate.category
        and owned.color_family == candidate.color_family
        and owned.pattern == candidate.pattern
        and abs(owned.formality - candidate.formality) <= 1
    )


def _is_statement(candidate: GarmentTags) -> bool:
    return candidate.color_family is ColorFamily.MULTI or candidate.pattern in _BOLD_PATTERNS


def _pairs_with(candidate: GarmentTags, owned: GarmentTags) -> bool:
    return (
        _worn_together(candidate.category, owned.category)
        and abs(owned.formality - candidate.formality) <= 1
        # One pattern per outfit: two prints side by side clash
        and Pattern.SOLID in (candidate.pattern, owned.pattern)
    )


def _worn_together(a: Category, b: Category) -> bool:
    return (a, b) in _WORN_TOGETHER or (b, a) in _WORN_TOGETHER


def _rank_pairings(candidate: GarmentTags, closet: Sequence[Garment]) -> tuple[Garment, ...]:
    """Return the closet garments that pair with `candidate`, best pairing first."""
    matches = [(i, g) for i, g in enumerate(closet) if _pairs_with(candidate, g.tags)]
    # Closest formality wins, then the most worn, then closet order, so ties repeat run to run
    matches.sort(key=lambda m: (abs(m[1].tags.formality - candidate.formality), -m[1].wears, m[0]))
    return tuple(g for _, g in matches)


# -----------------------------------------------------------------
# Gaps
# -----------------------------------------------------------------


@dataclass(frozen=True)
class _Gap:
    """One need in the week that the candidate covers and the closet does not."""

    reason: Reason
    # Completes "Buy it: ..." when this is the first gap
    headline: str


def _gaps_filled(
    candidate: GarmentTags, closet: Sequence[Garment], week: WeekContext, today: date
) -> list[_Gap]:
    """Return the gaps `candidate` fills, rain first, in a fixed order."""
    # Days and plans already past need nothing, so both count from `today`
    days = [d for d in week.forecast.days if d.day >= today] if week.forecast else []
    upcoming = [e for e in week.events if e.start.date() >= today]
    # Date, then clock time, then title: never compares aware with naive datetimes
    upcoming.sort(key=lambda e: (e.start.date(), e.start.time(), e.title))
    found = (
        _rain_gap(candidate, closet, days),
        _cold_gap(candidate, closet, days, today),
        *(_event_gap(candidate, closet, e, today) for e in upcoming),
    )
    return [g for g in found if g is not None]


def _rain_gap(
    candidate: GarmentTags, closet: Sequence[Garment], days: Sequence[DayForecast]
) -> _Gap | None:
    wet = [d for d in days if _is_wet(d)]
    owns_shell = any(_is_shell(g.tags) for g in closet)
    if not _is_shell(candidate) or owns_shell or len(wet) < _RAIN_GAP_AT_WET_DAYS:
        return None
    when = f"{len(wet)} of the next {len(days)} days"
    return _Gap(
        reason=Reason(
            code=ReasonCode.FILLS_WEATHER_GAP,
            message=f"Rain is due on {when} and you own no waterproof jacket.",
        ),
        headline=f"you own no rain shell and rain is due on {when}",
    )


def _cold_gap(
    candidate: GarmentTags, closet: Sequence[Garment], days: Sequence[DayForecast], today: date
) -> _Gap | None:
    cold = [d for d in days if d.temp_min_c <= _COLD_DAY_C]
    owns_warm_coat = any(_is_warm_coat(g.tags) for g in closet)
    if not _is_warm_coat(candidate) or owns_warm_coat or not cold:
        return None
    coldest = min(cold, key=lambda d: d.temp_min_c)
    # round() rather than a format spec, so -0.4 C reads "0 C" and not "-0 C"
    drop = f"it drops to {round(coldest.temp_min_c)} C {_when(coldest.day, today)}"
    return _Gap(
        reason=Reason(
            code=ReasonCode.FILLS_WEATHER_GAP,
            message=f"{drop[0].upper()}{drop[1:]} and you own no warm coat.",
        ),
        headline=f"you own no warm coat and {drop}",
    )


def _event_gap(
    candidate: GarmentTags, closet: Sequence[Garment], event: CalendarEvent, today: date
) -> _Gap | None:
    if event.formality is None or event.formality < _FORMAL_EVENT_AT:
        return None
    # Within one of the dress code is close enough to wear
    needed = event.formality - 1
    covered = any(
        g.tags.category == candidate.category and g.tags.formality >= needed for g in closet
    )
    if covered or candidate.formality < needed:
        return None
    noun = _NOUN[candidate.category]
    occasion = f"{event.title} {_when(event.start.date(), today)}"
    return _Gap(
        reason=Reason(
            code=ReasonCode.FITS_EVENT,
            message=(
                f"{occasion} has dress code {event.formality} of 5 "
                f"and you have no {noun} at {needed} or above."
            ),
        ),
        headline=f"you have no {noun} dressy enough for {occasion}",
    )


def _is_wet(day: DayForecast) -> bool:
    chance = day.precipitation_probability or 0
    return day.precipitation_mm >= _WET_DAY_MM or chance >= _WET_DAY_CHANCE


def _is_shell(tags: GarmentTags) -> bool:
    return tags.category is Category.OUTERWEAR and tags.waterproof


def _is_warm_coat(tags: GarmentTags) -> bool:
    return tags.category is Category.OUTERWEAR and tags.warmth >= _WARM_COAT_AT_WARMTH


def _when(day: date, today: date) -> str:
    """Say `day` the way a person would: today, tomorrow or on a weekday."""
    if day == today:
        return "today"
    if day == today + timedelta(days=1):
        return "tomorrow"
    return f"on {day:%A}"


# =============================================================================
# Reasons and wording
# =============================================================================


def _caveat(duplicates: Sequence[Garment], statement: bool, pairings: Sequence[Garment]) -> str:
    """Say why a TRY_WITH is not a BUY, naming the strongest cause only."""
    if duplicates:
        return f"it is close to your {phrase(duplicates[0])}, so make sure it adds something"
    if statement:
        return (
            "a bold print can clash with clothes that match it on paper, so see them together first"
        )
    things = "thing you own goes" if len(pairings) == 1 else "things you own go"
    return f"only {len(pairings)} {things} with it"


_STATEMENT_REASON = Reason(
    code=ReasonCode.STATEMENT_PIECE,
    message="A bold print can clash with clothes that match it on paper, so see it on you first.",
)


def _duplicates_reason(duplicates: Sequence[Garment]) -> Reason:
    return Reason(
        code=ReasonCode.DUPLICATES,
        message=f"You already own {len(duplicates)} like it: {list_garments(duplicates)}.",
        garment_ids=_ids(duplicates),
    )


def _pairings_reason(pairings: Sequence[Garment]) -> Reason:
    """Return PAIRS_WELL for a versatile candidate, FEW_PAIRINGS otherwise."""
    if not pairings:
        return Reason(
            code=ReasonCode.FEW_PAIRINGS,
            message="Nothing you own goes with it at a similar dressiness.",
        )
    if len(pairings) < _VERSATILE_AT_PAIRINGS:
        verb = "goes" if len(pairings) == 1 else "go"
        return Reason(
            code=ReasonCode.FEW_PAIRINGS,
            message=f"Only {list_garments(pairings)} {verb} with it.",
            garment_ids=_ids(pairings),
        )
    return Reason(
        code=ReasonCode.PAIRS_WELL,
        message=(
            f"It goes with {len(pairings)} things you own, best with your {phrase(pairings[0])}."
        ),
        garment_ids=_ids(pairings),
    )


def _color_word(color: ColorFamily) -> str:
    return "multicolor" if color is ColorFamily.MULTI else color.value


def _ids(garments: Sequence[Garment]) -> tuple[str, ...]:
    return tuple(g.id for g in garments)


def list_garments(garments: Sequence[Garment]) -> str:
    """Join garments as "your a, your b and your c" for a sentence."""
    phrases = [f"your {phrase(g)}" for g in garments]
    if len(phrases) == 1:
        return phrases[0]
    return f"{', '.join(phrases[:-1])} and {phrases[-1]}"


def phrase(garment: Garment) -> str:
    """Return the garment's description ready to sit mid-sentence."""
    text = garment.tags.description.strip().rstrip(".")
    # Taggers write sentence case; lower the first letter unless the word is an acronym
    if len(text) > 1 and text[1].islower():
        return text[0].lower() + text[1:]
    return text
