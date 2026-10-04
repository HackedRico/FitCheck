from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from fitcheck.domain import Category, ColorFamily, GarmentTags, Pattern
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
    flat: dict[str, Any] = _inline_refs(schema, schema.get("$defs", {}))
    return flat


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
