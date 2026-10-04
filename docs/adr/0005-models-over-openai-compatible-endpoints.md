# Models over OpenAI-compatible endpoints

The tagger and stylist each talk to one OpenAI-compatible chat endpoint, set by base URL, key and model, instead of a client per provider. The team has laptops without NVIDIA GPUs and no budget, so the default is a hosted provider of open weights (Featherless, or OpenRouter or Groq where Featherless lacks a vision model), and the same adapter points at our own vLLM, llama.cpp or Ollama server when we run one. Only garment cutouts and text reach these hosts; person photos go only to the try-on renderer (ADR 0003).

## Consequences

- A hosted provider shows as `public_api` in the pipeline panel; a local URL shows as `this_machine`, and `FITCHECK_VISION_RUNS_ON` or `FITCHECK_CHAT_RUNS_ON` can mark our own remote GPU as `self_hosted_gpu`.
- Structured output support varies by host, so the adapters ask for `json_schema`, fall back to `json_object`, validate every reply and retry once.
