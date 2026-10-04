from __future__ import annotations

from fitcheck.domain import (
    Category,
    ColorFamily,
    Decision,
    Garment,
    GarmentTags,
    Pattern,
    Reason,
    ReasonCode,
    RunsOn,
    StylistBrief,
    Verdict,
)
from fitcheck.settings import Settings
from fitcheck.stylist.template import TemplateStylist, build

# =============================================================================
# Module Overview
# =============================================================================
# Behaviour of `TemplateStylist`, the model-free stylist: it states the verdict,
# answers closet questions from `closet_matches` only, and asks for a render when
# the owner wants to see the candidate with named closet garments.


def garment(garment_id: str, category: Category, color: ColorFamily, description: str) -> Garment:
    """Return one of Maya's closet garments."""
    return Garment(
        id=garment_id,
        owner="maya",
        tags=GarmentTags(
            category=category,
            color_family=color,
            pattern=Pattern.SOLID,
            warmth=2,
            waterproof=False,
            formality=2,
            description=description,
        ),
    )


BLACK_JEANS = garment("black-jeans", Category.BOTTOM, ColorFamily.BLACK, "black straight-leg jeans")
BLUE_JEANS = garment("blue-jeans", Category.BOTTOM, ColorFamily.BLUE, "light blue mom jeans")
LEGGINGS = garment("leggings", Category.BOTTOM, ColorFamily.BLACK, "black high-rise leggings")
SNEAKERS = garment("sneakers", Category.SHOES, ColorFamily.WHITE, "white leather sneakers")

VERDICT = Verdict(
    decision=Decision.BUY,
    headline="Buy it: you own no rain shell and rain is due on 3 of the next 7 days.",
    reasons=(
        Reason(code=ReasonCode.FILLS_WEATHER_GAP, message="Rain is due on 3 days."),
        Reason(code=ReasonCode.PAIRS_WELL, message="It goes with 10 things you own."),
        Reason(code=ReasonCode.FEW_PAIRINGS, message="A third reason that must not show."),
    ),
)

stylist = TemplateStylist()


def test_states_the_verdict_first_then_at_most_two_reasons() -> None:
    reply = stylist.reply(StylistBrief(verdict=VERDICT), [], "Should I get it?")

    assert reply.text == (
        "Buy it: you own no rain shell and rain is due on 3 of the next 7 days. "
        "Rain is due on 3 days. It goes with 10 things you own."
    )
    assert reply.render is None


def test_without_a_verdict_it_answers_from_closet_matches_only() -> None:
    brief = StylistBrief(closet_matches=(BLACK_JEANS, BLUE_JEANS))

    reply = stylist.reply(brief, [], "What jeans do I have?")

    assert reply.text == (
        "From your closet: your black straight-leg jeans and your light blue mom jeans."
    )


def test_says_so_when_nothing_in_the_closet_matches() -> None:
    reply = stylist.reply(StylistBrief(), [], "Do I own a kilt?")

    assert reply.text == "Nothing in your closet matches that."
    assert reply.render is None


def test_asks_to_render_the_best_matching_closet_garment() -> None:
    brief = StylistBrief(verdict=VERDICT, closet_matches=(LEGGINGS, BLUE_JEANS, BLACK_JEANS))

    reply = stylist.reply(brief, [], "Show it with my black jeans")

    assert reply.render is not None
    assert reply.render.garment_ids == ("black-jeans",)
    assert reply.text.startswith(VERDICT.headline)
    assert reply.text.endswith("Showing it with your black straight-leg jeans.")


def test_renders_one_garment_per_category_when_several_are_named() -> None:
    brief = StylistBrief(closet_matches=(BLUE_JEANS, BLACK_JEANS, SNEAKERS))

    reply = stylist.reply(brief, [], "What would it look like with my jeans and sneakers?")

    assert reply.render is not None
    assert reply.render.garment_ids == ("blue-jeans", "sneakers")


def test_a_question_about_pairing_is_not_a_render_request() -> None:
    brief = StylistBrief(closet_matches=(BLACK_JEANS,))

    reply = stylist.reply(brief, [], "Would it go with my black jeans?")

    assert reply.render is None


def test_a_render_request_naming_nothing_owned_renders_nothing() -> None:
    brief = StylistBrief(closet_matches=(BLACK_JEANS,))

    reply = stylist.reply(brief, [], "Show it with my green kilt")

    assert reply.render is None


def test_build_reports_a_local_apache_licensed_adapter() -> None:
    built = build(Settings())

    assert built.info.name == "template-stylist"
    assert built.info.license == "Apache-2.0"
    assert built.info.runs_on is RunsOn.THIS_MACHINE
