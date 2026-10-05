from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from fitcheck.domain import Box, Category, ColorFamily, FoundGarment, GarmentTags, Pattern
from fitcheck.errors import TaggingFailed

# The allowed values sit in the prompt as well as the schema: constrained decoding only
# masks tokens, while a model that has read the options picks the right one more often
TAGGING_PROMPT = (
    "You tag one garment for a wardrobe app. Look only at the garment; ignore the hanger, "
    "the person and the background.\n"
    "Return JSON with these fields:\n"
    f"- category: one of {', '.join(c.value for c in Category)}. shirt is collared or "
    "buttoned, sweater is knitwear, outerwear is any coat or jacket, top is everything "
    "else worn on the upper body.\n"
    f"- color_family: one of {', '.join(c.value for c in ColorFamily)}. Use multi only "
    "when no one color covers most of the garment.\n"
    f"- pattern: one of {', '.join(p.value for p in Pattern)}.\n"
    "- warmth: 1 = summer tee, 5 = winter parka.\n"
    "- waterproof: true only for coated or shell fabrics.\n"
    "- formality: 1 = gym, 5 = black tie.\n"
    "- description: at most 12 words, such as 'navy wool crew-neck sweater'.\n"
    "If unsure, choose the more conservative value."
)

FIND_ALL_PROMPT = (
    "This photo shows several garments: a rack, a pile, a shelf or an open closet. "
    "Find every separate garment you can see clearly, up to 20. Skip hangers, furniture "
    "and garments mostly hidden behind others.\n"
    "For each, give its bounding box as [x1, y1, x2, y2] in coordinates from 0 to 1000 "
    "of the image width and height, and its tags with the same rules as below.\n\n"
)

# Models often wrap JSON in a markdown fence even when told not to
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# =============================================================================
# Module Overview
# =============================================================================
# The prompts and output contract for vision taggers, kept apart from any one host.
# `tags_json_schema` feeds constrained decoding and `parse_tags` turns a model's text
# into `GarmentTags`; `found_json_schema` and `parse_found` do the same for closet scans.


def tags_json_schema() -> dict[str, Any]:
    """Return the `GarmentTags` JSON schema with every `$ref` inlined, for constrained decoding."""
    schema = GarmentTags.model_json_schema()
    flat: dict[str, Any] = _inline_refs(schema, schema.get("$defs", {}))
    return flat


def found_json_schema() -> dict[str, Any]:
    """Return the schema for `find_all` answers: a list of tags plus a 0 to 1000 box each."""
    item = tags_json_schema()
    properties = dict(item.get("properties", {}))
    properties["box"] = {
        "type": "array",
        "items": {"type": "number", "minimum": 0, "maximum": 1000},
        "minItems": 4,
        "maxItems": 4,
    }
    item = {**item, "properties": properties, "required": [*item.get("required", []), "box"]}
    return {
        "type": "object",
        "properties": {"garments": {"type": "array", "items": item, "maxItems": 20}},
        "required": ["garments"],
    }


def parse_found(text: str) -> list[FoundGarment]:
    """Parse a `find_all` answer, dropping entries with unusable tags or degenerate boxes."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise TaggingFailed(f"Closet scan output is not JSON: {exc}") from exc
    entries = data.get("garments") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise TaggingFailed("Closet scan output has no `garments` list.")
    found: list[FoundGarment] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        box = _box(entry.pop("box", None))
        try:
            tags = GarmentTags.model_validate(entry)
        except ValidationError:
            # One bad entry should not throw away the rest of the closet
            continue
        if box is not None:
            found.append(FoundGarment(tags=tags, box=box))
    return found


def _box(raw: Any) -> Box | None:
    """Turn a 0 to 1000 `[x1, y1, x2, y2]` into a `Box`, or `None` if it is unusable."""
    if not isinstance(raw, list) or len(raw) != 4:
        return None
    try:
        x1, y1, x2, y2 = (min(max(float(v) / 1000, 0.0), 1.0) for v in raw)
    except (TypeError, ValueError):
        return None
    left, right = sorted((x1, x2))
    top, bottom = sorted((y1, y2))
    # A sliver this thin is a hanger or a model glitch, not a garment
    if right - left < 0.03 or bottom - top < 0.03:
        return None
    return Box(left=left, top=top, right=right, bottom=bottom)


def parse_tags(text: str) -> GarmentTags:
    """Parse model output into `GarmentTags`, or raise `TaggingFailed` with the reason."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        return GarmentTags.model_validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise TaggingFailed(f"Tagger output is not valid garment tags: {exc}") from exc


def _inline_refs(node: Any, defs: dict[str, Any]) -> Any:
    """Replace `{"$ref": "#/$defs/X"}` with the definition of X and drop `$defs`."""
    # Some constrained-decoding backends reject `$ref`, so ship a flat schema
    if isinstance(node, dict):
        if "$ref" in node:
            return _inline_refs(defs[node["$ref"].rsplit("/", 1)[-1]], defs)
        return {k: _inline_refs(v, defs) for k, v in node.items() if k != "$defs"}
    if isinstance(node, list):
        return [_inline_refs(item, defs) for item in node]
    return node
