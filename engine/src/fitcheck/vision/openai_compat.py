from __future__ import annotations

import base64

from fitcheck.domain import GarmentTags
from fitcheck.errors import TaggingFailed
from fitcheck.openai_compat import ChatClient, Message, adapter_info
from fitcheck.settings import Settings
from fitcheck.vision import images
from fitcheck.vision.prompts import TAGGING_PROMPT, parse_tags, tags_json_schema

# Qwen-VL spends one visual token per 28 to 32 px square; 768 px keeps weave and print
# readable at a fraction of the tokens of a 4000 px phone photo
MAX_SIDE_PX = 768
# Product shots sit on a light neutral backdrop, so a transparent cutout reads as one
BACKDROP = (240, 240, 240)
# Tags are facts, not prose: the same garment should get the same tags on stage as in rehearsal
TEMPERATURE = 0.0
MAX_TOKENS = 512

# =============================================================================
# Module Overview
# =============================================================================
# `OpenAICompatTagger` reads garment tags with an open-weight vision model on any
# OpenAI-compatible server. It sends the shrunk cutout as a data URL with
# `TAGGING_PROMPT`, parses with `parse_tags`, and on bad output retries once with the
# validation error before raising `TaggingFailed`. Only garment cutouts are sent.


class OpenAICompatTagger:
    """Garment tags from a vision model behind an OpenAI-compatible chat API."""

    def __init__(self, client: ChatClient, settings: Settings) -> None:
        self._client = client
        self._schema = tags_json_schema()
        self.info = adapter_info(client.base_url, client.model, settings.vision_runs_on)

    def tag(self, image_png: bytes) -> GarmentTags:
        """Read the garment in `image_png`; raise `TaggingFailed` if two answers are unusable."""
        image = images.flatten(images.open_image(image_png), BACKDROP)
        jpeg = images.encode_jpeg(images.fit_within(image, MAX_SIDE_PX))
        data_url = f"data:image/jpeg;base64,{base64.b64encode(jpeg).decode('ascii')}"
        messages: list[Message] = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": TAGGING_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ]
        text = self._ask(messages)
        try:
            return parse_tags(text)
        except TaggingFailed as first:
            messages += [
                {"role": "assistant", "content": text},
                {
                    "role": "user",
                    "content": f"That answer was invalid: {first}. Reply with only the JSON.",
                },
            ]
            return parse_tags(self._ask(messages))

    def _ask(self, messages: list[Message]) -> str:
        return self._client.complete(
            messages,
            schema=self._schema,
            schema_name="garment_tags",
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
        )


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
