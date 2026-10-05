---
name: fit-check
description: Decides whether to buy a garment by checking it against the owner's closet, the coming week's weather and their calendar, and answers BUY, SKIP or TRY-WITH with reasons. Use when someone shares a photo of clothing they are considering, asks "should I buy this", asks what to wear this week, or wants to add clothes to their closet.
license: Apache-2.0
compatibility: Needs the FitCheck repo, Python 3.12 or newer, and uv. Real garment tagging needs an OpenAI-compatible vision endpoint (Featherless by default, or Ollama with qwen3-vl:8b-instruct).
metadata:
  author: fitcheck
  version: "0.1"
---

# Fit check

`scripts/fitcheck.sh` runs the FitCheck engine and passes its arguments to the `fitcheck` CLI. Every command prints JSON to stdout; errors go to stderr.

## Quick start

```bash
scripts/fitcheck.sh judge --image ~/Downloads/raincoat.jpg
```

Read `verdict.decision` (`buy`, `skip` or `try_with`) and say `verdict.headline` first; it is already a sentence written to be said out loud.

## Workflows

### Should I buy this?

1. Run `judge --image <photo>`, or `judge --url <link>` for a shop page or image link. Add `--owner <name>` when the person is not the default owner, and `--lat <lat> --lon <lon>` when you know where they are.
2. Answer with `verdict.headline`, then at most two `verdict.reasons[].message`.
3. For `try_with`, name `verdict.best_pairing.tags.description`. For `skip` with duplicates, name what they already own from `verdict.duplicates[].tags.description`.
4. The decision is final. Explain it; when the person pushes back, give the reasons again rather than a different answer.

### What should I wear this week?

1. Run `week` for the forecast and plans, then `chat "<their question>"`.
2. Relay `reply.text`. If `reply.render` lists garment ids, offer to show the outfit.

### Add clothes to the closet

1. Run `add <photo>` once per garment, with `--price <amount>` when known. It cuts out the garment, tags it and stores it.
2. Run `closet` to confirm. `forget --yes` deletes the whole closet, so run it only when the person asks for that in so many words.

### Show it on them

Run `render <person photo> <garment photo> --region upper --out render.png` (`lower` for bottoms, `full` for dresses). The person photo is never stored. When `fallback` is true, the AI renderer was unavailable and the image is a flat preview; say so.

### Already have tags?

Pass them instead of a photo: `judge --tags '{"category":"outerwear","color_family":"yellow","pattern":"solid","warmth":3,"waterproof":true,"formality":2,"description":"yellow rain shell"}'`. Fields and allowed values are listed in the repo's `engine/src/fitcheck/domain.py` under `GarmentTags`.

## Exit codes

| Code | Meaning | Do next |
| --- | --- | --- |
| 0 | Success | Read the JSON |
| 1 | The model's answer was unusable | Retry, or pass `--tags` |
| 2 | Bad input, such as a missing file or invalid tags | Fix the argument named on stderr |
| 3 | A backing service is down | stderr names the fix, such as the env var to set |
| 4 | Owner or garment not found | Run `closet` to see what exists |

## Configuration

Adapters come from `FITCHECK_*` env vars, the same ones the server reads. With none set, the engine runs offline on fakes and a fixture week, and the fake tagger only reads color. For real tags, set `FITCHECK_TAGGER=openai_compat` and `FITCHECK_VISION_API_KEY` in the repo's `engine/.env`, or point `FITCHECK_VISION_BASE_URL` at your own server such as Ollama. `health` shows which adapter fills each slot.

Every result carries a `pipeline` listing each step's model, license and `runs_on`. A step with `touched_person_image: true` and `runs_on: public_api` sent a person photo off this machine; say so when you show a render.
