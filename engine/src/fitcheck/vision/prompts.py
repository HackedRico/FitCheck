from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from fitcheck.domain import GarmentTags
from fitcheck.errors import TaggingFailed

TAGGING_PROMPT = (
    "You tag one garment for a wardrobe app. Look only at the garment; ignore the hanger, "
    "the person and the background.\n"
    "Return JSON matching the schema. warmth: 1 = summer tee, 5 = winter parka. "
    "formality: 1 = gym, 5 = black tie.\n"
    "waterproof is true only for coated or shell fabrics. "
    "If unsure, choose the more conservative value. description: at most 12 words."
)

# Models often wrap JSON in a markdown fence even when told not to
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# =============================================================================
# Module Overview
# =============================================================================
# The tagging prompt and output contract shared by every vision tagger, so Qwen3-VL
# on Ollama and Llama 4 on Cortex read garments the same way. `tags_json_schema`
# feeds constrained decoding; `parse_tags` turns any model's text into `GarmentTags`.


def tags_json_schema() -> dict[str, Any]:
    """Return the `GarmentTags` JSON schema with every `$ref` inlined, for constrained decoding."""
    schema = GarmentTags.model_json_schema()
    return _inline_refs(schema, schema.get("$defs", {}))


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
