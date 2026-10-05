from __future__ import annotations

import io
import json
from datetime import date
from pathlib import Path

import pytest
from PIL import Image

from fitcheck.closet.memory import MemoryClosetStore
from fitcheck.domain import Box, Category, FoundGarment, GarmentTags, Location
from fitcheck.engine import Engine, Ports
from fitcheck.errors import TaggingFailed
from fitcheck.vision.fake import FakeTagger
from fitcheck.vision.prompts import found_json_schema, parse_found

# =============================================================================
# Module Overview
# =============================================================================
# Tests for scanning a whole closet: parsing a vision model's list of garments
# with boxes, and `Engine.scan_closet` adding each found garment on its own.

TAGS = {
    "category": "sweater",
    "color_family": "navy",
    "pattern": "solid",
    "warmth": 3,
    "waterproof": False,
    "formality": 2,
    "description": "navy crewneck",
}


def test_parse_found_reads_boxes_as_fractions() -> None:
    found = parse_found(json.dumps({"garments": [{**TAGS, "box": [100, 200, 500, 900]}]}))
    assert len(found) == 1
    assert found[0].tags.category is Category.SWEATER
    assert found[0].box == Box(left=0.1, top=0.2, right=0.5, bottom=0.9)


def test_parse_found_keeps_good_entries_when_one_is_bad() -> None:
    answer = {
        "garments": [
            {**TAGS, "box": [0, 0, 400, 400]},
            {**TAGS, "category": "spaceship", "box": [500, 0, 900, 400]},
            {**TAGS, "box": [10, 10, 15, 900]},
            {**TAGS, "box": "everywhere"},
        ]
    }
    assert len(parse_found(json.dumps(answer))) == 1


def test_parse_found_orders_flipped_corners() -> None:
    found = parse_found(json.dumps({"garments": [{**TAGS, "box": [600, 800, 100, 200]}]}))
    assert found[0].box == Box(left=0.1, top=0.2, right=0.6, bottom=0.8)


@pytest.mark.parametrize("text", ["not json", json.dumps({"items": []}), json.dumps([1, 2])])
def test_parse_found_rejects_unusable_answers(text: str) -> None:
    with pytest.raises(TaggingFailed):
        parse_found(text)


def test_schema_requires_a_box_per_garment() -> None:
    item = found_json_schema()["properties"]["garments"]["items"]
    assert "box" in item["required"]
    assert item["properties"]["box"]["minItems"] == 4


class _TwoGarments(FakeTagger):
    """Finds a left and a right garment in any photo."""

    def find_all(self, image_png: bytes) -> list[FoundGarment]:
        tags = GarmentTags.model_validate(TAGS)
        return [
            FoundGarment(tags=tags, box=Box(left=0, top=0, right=0.5, bottom=1)),
            FoundGarment(tags=tags, box=Box(left=0.5, top=0, right=1, bottom=1)),
        ]


class _Passthrough:
    info = FakeTagger.info

    def cut(self, image: bytes) -> bytes:
        return image


def _engine(tmp_path: Path, store: MemoryClosetStore) -> Engine:
    def unused(*_: object) -> object:
        raise AssertionError("not used by a closet scan")

    ports = Ports(
        store=store,
        tagger=_TwoGarments(),
        cutter=_Passthrough(),
        renderer=unused,  # type: ignore[arg-type]
        weather=unused,  # type: ignore[arg-type]
        calendar=unused,  # type: ignore[arg-type]
        stylist=unused,  # type: ignore[arg-type]
    )
    return Engine(
        ports,
        data_dir=tmp_path,
        default_location=Location(latitude=0, longitude=0),
        today=lambda: date(2026, 10, 4),
    )


def test_scan_closet_adds_each_found_garment_with_its_own_crop(tmp_path: Path) -> None:
    store = MemoryClosetStore()
    photo = io.BytesIO()
    Image.new("RGB", (200, 100), "white").save(photo, format="PNG")

    result = _engine(tmp_path, store).scan_closet("ricky", photo.getvalue())

    assert len(result.garments) == 2
    assert len(store.garments("ricky")) == 2
    widths = []
    for garment in result.garments:
        assert garment.image_ref is not None
        with Image.open(tmp_path / "garments" / garment.image_ref) as crop:
            widths.append(crop.size[0])
    # Each half plus a 4 percent margin, never the whole 200 px photo
    assert all(100 <= w < 200 for w in widths)
    assert result.pipeline[0].step == "find_garments"


def test_scan_closet_crops_a_phone_photo_the_way_the_tagger_saw_it(tmp_path: Path) -> None:
    store = MemoryClosetStore()
    # Stored 200x100 with EXIF "rotate 90", so it is 100x200 upright, as the tagger sees it
    exif = Image.Exif()
    exif[0x0112] = 6
    photo = io.BytesIO()
    Image.new("RGB", (200, 100), "white").save(photo, format="JPEG", exif=exif.tobytes())

    result = _engine(tmp_path, store).scan_closet("ricky", photo.getvalue())

    for garment in result.garments:
        assert garment.image_ref is not None
        with Image.open(tmp_path / "garments" / garment.image_ref) as crop:
            # Half the upright width plus margin, and the full upright height
            assert crop.size[0] < 60
            assert crop.size[1] == 200


class _ScriptedClient:
    """A chat client that returns canned answers in order and records each request."""

    base_url = "http://localhost:11434/v1"
    model = "test-model"

    def __init__(self, answers: list[str]) -> None:
        self._answers = answers
        self.calls: list[object] = []

    def complete(self, messages: object, **_: object) -> str:
        self.calls.append(messages)
        return self._answers[len(self.calls) - 1]


def test_an_empty_scan_is_asked_once_more(png_bytes: bytes) -> None:
    from fitcheck.settings import Settings
    from fitcheck.vision.openai_compat import OpenAICompatTagger

    full = json.dumps({"garments": [{**TAGS, "box": [0, 0, 500, 500]}]})
    client = _ScriptedClient([json.dumps({"garments": []}), full])
    tagger = OpenAICompatTagger(client, Settings())  # type: ignore[arg-type]

    found = tagger.find_all(png_bytes)

    assert len(found) == 1
    assert len(client.calls) == 2


def test_two_empty_answers_mean_nothing_was_found(png_bytes: bytes) -> None:
    from fitcheck.settings import Settings
    from fitcheck.vision.openai_compat import OpenAICompatTagger

    empty = json.dumps({"garments": []})
    client = _ScriptedClient([empty, empty])
    tagger = OpenAICompatTagger(client, Settings())  # type: ignore[arg-type]

    assert tagger.find_all(png_bytes) == []
    assert len(client.calls) == 2
