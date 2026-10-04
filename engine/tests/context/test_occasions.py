from __future__ import annotations

import pytest

from fitcheck.context.occasions import infer_formality

# =============================================================================
# Module Overview
# =============================================================================
# Tests for `infer_formality`: the keyword table, whole-word matching, any case,
# the strictest keyword winning, and `None` for titles with no hint.


@pytest.mark.parametrize(
    ("title", "formality"),
    [
        ("Gym", 1),
        ("Morning run", 1),
        ("Climbing with Jo", 1),
        ("Brunch", 2),
        ("Drinks after work", 2),
        ("Coffee with Priya", 2),
        ("Team dinner", 3),
        ("Date night", 3),
        ("Birthday party", 3),
        ("Quarterly presentation", 3),
        ("Job interview", 4),
        ("Client meeting", 4),
        ("Office day", 4),
        ("Sam's wedding", 5),
        ("Museum gala", 5),
        ("Black tie dinner", 5),
        ("Formal", 5),
    ],
)
def test_maps_each_keyword_to_its_dress_code(title: str, formality: int) -> None:
    assert infer_formality(title) == formality


@pytest.mark.parametrize("title", ["CLIENT MEETING", "client Meeting", "cLiEnT mEeTiNg"])
def test_ignores_case(title: str) -> None:
    assert infer_formality(title) == 4


@pytest.mark.parametrize(
    "title",
    ["Gymnastics on TV", "Rerun of the show", "Update the docs", "Officer training", "Partyka"],
)
def test_matches_whole_words_only(title: str) -> None:
    assert infer_formality(title) is None


def test_multi_word_keyword_needs_every_word() -> None:
    assert infer_formality("Client call") is None
    assert infer_formality("Meeting with a client") is None


def test_black_tie_matches_with_a_hyphen() -> None:
    assert infer_formality("Black-tie fundraiser") == 5


@pytest.mark.parametrize(
    ("title", "formality"),
    [
        ("Gym then dinner", 3),
        ("Wedding brunch", 5),
        ("Coffee before the interview", 4),
        ("Run to the office party", 4),
    ],
)
def test_strictest_keyword_wins(title: str, formality: int) -> None:
    assert infer_formality(title) == formality


@pytest.mark.parametrize("title", ["", "Dentist", "Pick up groceries", "Call mom"])
def test_returns_none_without_a_keyword(title: str) -> None:
    assert infer_formality(title) is None
