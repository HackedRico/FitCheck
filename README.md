```
 _____ _ _    ____ _               _
|  ___(_) |_ / ___| |__   ___  ___| | __
| |_  | | __| |   | '_ \ / _ \/ __| |/ /
|  _| | | |_| |___| | | |  __/ (__|   <
|_|   |_|\__|\____|_| |_|\___|\___|_|\_\

        a second opinion in the fitting-room line
```

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/HackedRico/FitCheck/actions/workflows/ci.yml/badge.svg)](https://github.com/HackedRico/FitCheck/actions/workflows/ci.yml)
[![Hacktoberfest](https://img.shields.io/badge/Hacktoberfest-friendly-orange.svg)](CONTRIBUTING.md)

Point your phone at a garment, or paste a shop link. FitCheck reads it, checks it against what you already own, this week's weather and your calendar, and tells you straight: **BUY**, **SKIP** or **TRY-WITH**. Then it shows the garment on you.

## What it does

- **Scan or link a garment.** Camera, photo, or any product page. An open-weight vision model tags it.
- **Get a verdict.** Plain rules weigh your closet, a 7-day forecast and your plans, so the answer is the same every time. A stylist chat explains it.
- **See it on you.** Live on the camera, tracked to your body on the device, or as an AI try-on render.
- **Keep a closet.** Add pieces one by one, by shop link, or scan a whole rack in one photo.

```
   snap   |   shop link   |   photo
       \        |        /
        v       v       v
   [ tag the garment ]       open-weight vision model
             |
             v
   [ decide ]                rules: closet + weather + calendar
             |
             v
   BUY / SKIP / TRY-WITH  +  see it on you  +  ask the stylist
```

Your body photo stays on your phone. It only leaves for a try-on render, is never stored, and the app tells you where every step ran.

## Quick start

You need [uv](https://docs.astral.sh/uv/), Node.js 20.19 or newer, and `make`.

```bash
make sync          # engine dependencies
make web-install   # web app dependencies
make dev           # engine on :8000, web app on https://localhost:5173
```

It runs offline out of the box, with a demo closet and a demo week. Your phone can join on the same Wi-Fi through the network URL Vite prints.

For real models, copy `engine/.env.example` to `engine/.env`, set `FITCHECK_TAGGER` and `FITCHECK_STYLIST` to `openai_compat`, and add a key for any OpenAI-compatible host such as [Featherless](https://featherless.ai), or point them at your own Ollama or vLLM server. For AI try-on renders, set `FITCHECK_TRYON=hf_space` and add a free [Hugging Face](https://huggingface.co/settings/tokens) token as `HF_TOKEN`.

## Repo map

| Path | What's there |
| --- | --- |
| `engine/` | Python engine and API: verdict rules, adapters, CLI |
| `web/` | Mobile-first web app (Vite, React, TypeScript) |
| `worker/` | Try-on worker the `remote` adapter calls; only an `echo` backend ships |
| `skills/fit-check/` | Agent skill that drives FitCheck from a shell |
| `docs/` | Guides and decision records |

New here? Read [`AGENTS.md`](AGENTS.md) for how the code fits together and [`CONTEXT.md`](CONTEXT.md) for the vocabulary.

## Built at Hacktoberfest

FitCheck was built for a Hacktoberfest mini hackathon run by [Technica](https://gotechnica.org), [Bitcamp](https://bit.camp) and [Hack4Impact UMD](https://umd.hack4impact.org), where it won the **open source track**. Thanks to the organizers, and to everyone in the [contributors list](https://github.com/HackedRico/FitCheck/graphs/contributors).

## Contributing

Issues and pull requests are welcome, Hacktoberfest or not. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[Apache 2.0](LICENSE). Models, data and photos FitCheck uses keep their own licenses; see [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
