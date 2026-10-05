# Models

The tagger and the stylist call any server that speaks the OpenAI chat API, so the same adapter works with a hosted provider of open weights or a server you run (ADR 0005). Only garment photos and text reach these hosts. Person photos go to the try-on renderer and nowhere else (ADR 0003); `docs/gpu.md` covers try-on.

## Defaults

| Step | Model | License | Host |
| --- | --- | --- | --- |
| Tagger: tags for one garment, and every garment in a closet scan | `Qwen/Qwen3-VL-8B-Instruct` | Apache 2.0 | Featherless |
| Stylist | `Qwen/Qwen3-30B-A3B-Instruct-2507` | Apache 2.0 | Featherless |
| Cutout | rembg `isnet-general-use` | Apache 2.0 | this machine, CPU |

The stylist model runs without a thinking mode, so replies start with the JSON. The earlier default, Qwen3-32B, thinks first.

## Turn them on

Put these in `engine/.env`, which git ignores:

```sh
FITCHECK_TAGGER=openai_compat
FITCHECK_STYLIST=openai_compat
FITCHECK_VISION_API_KEY=...   # from https://featherless.ai, account settings
FITCHECK_CHAT_API_KEY=...
```

| Variable | Meaning |
| --- | --- |
| `FITCHECK_VISION_BASE_URL`, `FITCHECK_CHAT_BASE_URL` | Server root ending in `/v1`; Featherless by default |
| `FITCHECK_VISION_API_KEY`, `FITCHECK_CHAT_API_KEY` | Bearer key; leave empty for a local server |
| `FITCHECK_VISION_MODEL`, `FITCHECK_CHAT_MODEL` | Model id as the host names it |
| `FITCHECK_VISION_RUNS_ON`, `FITCHECK_CHAT_RUNS_ON` | Where the pipeline panel says it ran. Unset means a loopback URL is `this_machine` and anything else is `public_api`; set `self_hosted_gpu` for a box you own |
| `FITCHECK_LLM_TIMEOUT_S` | Per-request timeout, 60 by default |

Structured output support varies by host. The adapter asks for `json_schema`; if the host answers 400, it switches to `json_object` with the schema in the prompt for the rest of the run. It validates every reply and asks once more on bad output. OpenRouter also works and documents `json_schema` support ([structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)).

## Your own server

With Ollama on an M2 with 16 GB:

```sh
ollama serve
make ollama-pull     # qwen3-vl:8b-instruct, 6.1 GB on disk, about 8 GB of RAM in use
```

```sh
# engine/.env
FITCHECK_VISION_BASE_URL=http://localhost:11434/v1
FITCHECK_VISION_MODEL=qwen3-vl:8b-instruct
FITCHECK_VISION_API_KEY=
```

Pull the `-instruct` tag. Ollama's plain `qwen3-vl:8b` is the Thinking variant: it reasons before every answer, and tagging took 11.3 s warm against 4.3 s for the instruct model. With 8 GB of RAM, use `qwen3-vl:4b-instruct`. Ollama's `/v1` honours `json_schema`.

For vLLM, run `vllm serve Qwen/Qwen3-VL-8B-Instruct`; for llama.cpp, `llama-server` with the model and its `mmproj` file. Point the base URL at `http://<host>:8000/v1` and set `*_RUNS_ON=self_hosted_gpu`.

## Cutout

Set `FITCHECK_CUTOUT=rembg` for engine-side cutouts. IS-Net runs on the CPU, and the first cut downloads 170 MB to `~/.rembg`. On a test photo of a tee on a hanger it took 1.3 s and dropped the hanger wire. `birefnet-general-lite` took 9 to 13 s and kept the wire, `u2net_cloth_seg` mangled the garment, and `bria-rmbg` is CC BY-NC.

The live preview does its own cutout on the phone with MediaPipe when a garment image has no transparency.
