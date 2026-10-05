from __future__ import annotations

import base64
from typing import Any

from fitcheck.domain import FoundGarment, GarmentTags
from fitcheck.errors import TaggingFailed
from fitcheck.openai_compat import ChatClient, Message, adapter_info
from fitcheck.settings import Settings
from fitcheck.vision import images
from fitcheck.vision.prompts import (
    FIND_ALL_PROMPT,
    TAGGING_PROMPT,
    found_json_schema,
    parse_found,
    parse_tags,
    tags_json_schema,
)

# Qwen-VL spends one visual token per 28 to 32 px square; 768 px keeps weave and print
# readable at a fraction of the tokens of a 4000 px phone photo
MAX_SIDE_PX = 768
# Product shots sit on a light neutral backdrop, so a transparent cutout reads as one
BACKDROP = (240, 240, 240)
# Tags are facts, not prose: the same garment should get the same tags on stage as in rehearsal
TEMPERATURE = 0.0
MAX_TOKENS = 512
# Up to 20 garments with tags each need far more room than one garment
FIND_ALL_MAX_TOKENS = 4096
# A whole rack needs more pixels than one garment so small items stay legible
FIND_ALL_MAX_SIDE_PX = 1280

# =============================================================================
# Module Overview
# =============================================================================
# `OpenAICompatTagger` reads garment tags with an open-weight vision model on any
# OpenAI-compatible server. It sends the shrunk cutout as a data URL with
# `TAGGING_PROMPT`, parses with `parse_tags`, and on bad output retries once with the
# validation error before raising `TaggingFailed`. `find_all` asks the same model
# for every garment in a photo of a rack or closet, with boxes. Only garment photos
# are sent, never person photos.


class OpenAICompatTagger:
    """Garment tags from a vision model behind an OpenAI-compatible chat API."""

    def __init__(self, client: ChatClient, settings: Settings) -> None:
        self._client = client
        self._schema = tags_json_schema()
        self.info = adapter_info(client.base_url, client.model, settings.vision_runs_on)

    def tag(self, image_png: bytes) -> GarmentTags:
        """Read the garment in `image_png`; raise `TaggingFailed` if two answers are unusable."""
        messages = [_image_message(image_png, TAGGING_PROMPT, MAX_SIDE_PX)]
        text = self._ask(messages)
        try:
            return parse_tags(text)
        except TaggingFailed as first:
            messages += _retry(text, _invalid_note(first))
            return parse_tags(self._ask(messages))

    def find_all(self, image_png: bytes) -> list[FoundGarment]:
        """Find every garment in a rack or closet photo; ask again once on a bad or empty answer."""
        prompt = FIND_ALL_PROMPT + TAGGING_PROMPT
        messages = [_image_message(image_png, prompt, FIND_ALL_MAX_SIDE_PX)]
        schema = found_json_schema()
        text = self._ask(messages, schema, "closet_scan", FIND_ALL_MAX_TOKENS)
        try:
            found = parse_found(text)
            if found:
                return found
            # Hosted models sometimes answer an empty list for a photo full of clothes
            nudge = (
                "You listed no garments. Look again: list every clothing item you can see, "
                "worn by a person or hanging or lying, each with its own box."
            )
        except TaggingFailed as first:
            nudge = _invalid_note(first)
        messages += _retry(text, nudge)
        return parse_found(self._ask(messages, schema, "closet_scan", FIND_ALL_MAX_TOKENS))

    def _ask(
        self,
        messages: list[Message],
        schema: dict[str, Any] | None = None,
        name: str = "garment_tags",
        max_tokens: int = MAX_TOKENS,
    ) -> str:
        return self._client.complete(
            messages,
            schema=schema or self._schema,
            schema_name=name,
            temperature=TEMPERATURE,
            max_tokens=max_tokens,
        )


def _image_message(image_png: bytes, prompt: str, max_side: int) -> Message:
    """Return a user message with `prompt` and the image, flattened and shrunk, as a data URL."""
    image = images.flatten(images.open_image(image_png), BACKDROP)
    jpeg = images.encode_jpeg(images.fit_within(image, max_side))
    data_url = f"data:image/jpeg;base64,{base64.b64encode(jpeg).decode('ascii')}"
    return {
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": data_url}},
        ],
    }


def _retry(answer: str, nudge: str) -> list[Message]:
    """Return the turns that show the model its last `answer` and ask again with `nudge`."""
    return [{"role": "assistant", "content": answer}, {"role": "user", "content": nudge}]


def _invalid_note(error: TaggingFailed) -> str:
    """Return the follow-up that quotes why the last answer failed validation."""
    return f"That answer was invalid: {error}. Reply with only the JSON."


def build(settings: Settings) -> OpenAICompatTagger:
    """Return an `OpenAICompatTagger` for the `vision_*` settings."""
    client = ChatClient(
        base_url=settings.vision_base_url,
        api_key=settings.vision_api_key,
        model=settings.vision_model,
        timeout_s=settings.llm_timeout_s,
        key_env="FITCHECK_VISION_API_KEY",
        model_env="FITCHECK_VISION_MODEL",
    )
    return OpenAICompatTagger(client, settings)
