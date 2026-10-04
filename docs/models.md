# Models

Every model FitCheck runs is open weight. The tagger and the stylist call any server that speaks the OpenAI chat API, so the same adapter works with a hosted provider or with a server we run. Only garment cutouts and text reach these hosts. Person photos go to the try-on renderer and nowhere else (ADR 0003).

## Defaults

| Step | Model | License | Host | Why |
| --- | --- | --- | --- | --- |
| Tagger | `Qwen/Qwen3-VL-8B-Instruct` | Apache-2.0 | Featherless | Open-weight VLM that Featherless serves with image input; the same weights run on Ollama as `qwen3-vl:8b-instruct` |
| Stylist | `Qwen/Qwen3-30B-A3B-Instruct-2507` | Apache-2.0 | Featherless | Strong MoE instruct model with no thinking mode, so replies start with the JSON |
| Cutout | rembg `isnet-general-use` | Apache-2.0 | this machine, CPU | See below |

Evidence:

- Featherless serves Qwen3-VL-8B-Instruct as a vision model under Apache-2.0: https://featherless.ai/models/Qwen/Qwen3-VL-8B-Instruct. Images go in `image_url` content as URLs or base64 data URLs: https://featherless.ai/docs/vision
- Featherless documents no `response_format` parameter: https://featherless.ai/docs/completions. The adapter asks for `json_schema` anyway. If the host answers 400, the adapter falls back to `json_object` with the schema in the prompt. If it ignores the field, the prompts still spell out the JSON, and the adapter retries once on bad output. This is unverified because we had no Featherless key.
- Qwen3-30B-A3B-Instruct-2507 runs in non-thinking mode, under Apache-2.0: https://featherless.ai/models/Qwen/Qwen3-30B-A3B-Instruct-2507. The earlier default, Qwen3-32B, thinks by default.
- License cards: https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct and https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct (both apache-2.0).

## Alternatives

- **OpenRouter** lists `qwen/qwen3-vl-8b-instruct`, `qwen/qwen3-vl-32b-instruct`, `meta-llama/llama-4-scout` and `google/gemma-3-27b-it` with `structured_outputs` support (from `https://openrouter.ai/api/v1/models`, October 2026). Use it if you need verified `json_schema` support: https://openrouter.ai/docs/guides/features/structured-outputs
- **Groq** supports structured outputs only on a few text models, with no vision model listed, so it does not suit the tagger: https://console.groq.com/docs/structured-outputs

## Keys and settings

| Variable | Meaning |
| --- | --- |
| `FITCHECK_TAGGER=openai_compat`, `FITCHECK_STYLIST=openai_compat` | Turn the adapters on |
| `FITCHECK_VISION_BASE_URL`, `FITCHECK_CHAT_BASE_URL` | Server root ending in `/v1` |
| `FITCHECK_VISION_API_KEY`, `FITCHECK_CHAT_API_KEY` | Bearer key; leave unset for a local server |
| `FITCHECK_VISION_MODEL`, `FITCHECK_CHAT_MODEL` | Model id as the host names it |
| `FITCHECK_VISION_RUNS_ON`, `FITCHECK_CHAT_RUNS_ON` | Override where the pipeline panel says it ran (`self_hosted_gpu` for a box you own). Unset means loopback is `this_machine` and anything else is `public_api` |
| `FITCHECK_LLM_TIMEOUT_S` | Per-request timeout |

Get a Featherless key at https://featherless.ai under account settings, or an OpenRouter key at https://openrouter.ai/keys. Put keys in `engine/.env`, which git ignores.

## Your own server

Any OpenAI-compatible server works. With Ollama 0.34 on an M2 with 16 GB:

```sh
ollama serve
ollama pull qwen3-vl:8b-instruct     # 6.1 GB on disk, about 8 GB of RAM in use
FITCHECK_VISION_BASE_URL=http://localhost:11434/v1
FITCHECK_VISION_MODEL=qwen3-vl:8b-instruct
FITCHECK_VISION_API_KEY=
```

Pull the `-instruct` tag. Ollama's plain `qwen3-vl:8b` is the Thinking variant: it reasons for 100+ tokens before every answer, and `think: false` does not stop it. On machines with 8 GB of RAM, use `qwen3-vl:4b-instruct` (3.3 GB).

Measured on that M2, tagging a 768 px garment image through `/v1`:

| Model | Cold, model load included | Warm |
| --- | --- | --- |
| `qwen3-vl:8b-instruct` | not timed alone | 4.3 s |
| `qwen3-vl:8b` (Thinking) | 36 s | 11.3 s |

Ollama's `/v1` honours `response_format` `json_schema`, enums included. For vLLM, run `vllm serve Qwen/Qwen3-VL-8B-Instruct`. For llama.cpp, run `llama-server` with the model and its `mmproj` file. Then point the base URL at `http://<host>:8000/v1` and set `*_RUNS_ON=self_hosted_gpu`.

## Cutout

rembg with `isnet-general-use` (IS-Net, Apache-2.0, https://github.com/xuebinqin/DIS) runs on the CPU. The first cut downloads 170 MB to `~/.rembg`. On a synthetic tee-on-a-hanger photo on the M2, IS-Net took 1.3 s and dropped the hanger wire. `birefnet-general-lite` took 9 to 13 s and kept the wire. `u2net_cloth_seg` mangled the garment, and `bria-rmbg` is CC BY-NC.
