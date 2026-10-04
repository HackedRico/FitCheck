# Hosting try-on without a budget

FitCheck has three try-on adapters, chosen with `FITCHECK_TRYON`:

| Value | Runs on | Person photo goes to |
| --- | --- | --- |
| `overlay` | this machine, Pillow only | nowhere |
| `remote` | the worker in `worker/` on a GPU you control | that worker |
| `hf_space` | the public `franciszzj/Leffa` Space | Hugging Face, so the UI warns |

All facts below were checked on 2026-10-04.

## Free and student GPU options

| Option | What you get | Catch | Source |
| --- | --- | --- | --- |
| Hugging Face ZeroGPU, calling the Leffa Space | Half an RTX Pro 6000 (48 GB) per call. Daily quota per caller: 2 min unauthenticated, 5 min with a free account, 40 min with PRO | The Leffa Space asks for 180 s per call, so a call only starts while you have 180 s left. Measured today: anonymous got one call, then "180s requested vs. 174s left, try again in 23:59". ZeroGPU Spaces run Gradio only | [docs](https://huggingface.co/docs/hub/spaces-zerogpu) |
| Modal Starter | $30 of credit a month. T4 $0.59/h, L4 $0.80/h, A10 $1.10/h, A100 40 GB $2.10/h | Web requests time out at 150 s and then answer 303; `RemoteRenderer` follows it. Whether signup needs a card is unverified | [pricing](https://modal.com/pricing), [timeouts](https://modal.com/docs/guide/webhook-timeouts) |
| Google Colab free | Usually a T4 with 16 GB, sessions up to 12 h | The free tier bans "bypassing the notebook UI to interact primarily via a web UI", and all tiers ban "connecting to remote proxies". A worker behind a Cloudflare tunnel falls under both | [FAQ](https://research.google.com/colaboratory/faq.html) |
| Kaggle notebooks | Up to 30 GPU hours a week, P100 or 2x T4, 12 h sessions | GPU and internet need phone verification. Tunnels out of kernels are reported as a ban risk | [Ultralytics guide](https://docs.ultralytics.com/integrations/kaggle), [Kaggle thread](https://www.kaggle.com/discussions/product-feedback/743898) |
| Lightning AI | A free Studio with a few GPU hours a month, per third-party write-ups | The official pricing page did not load, so the numbers are unverified | [write-up](https://www.usagepricing.com/blueprint/lightning-ai) |
| Azure for Students | $100 over 12 months, no card | A Microsoft answer says the subscription caps you at 3 vCPUs, which means no GPU VMs | [offer](https://azure.microsoft.com/en-us/free/students), [answer](https://learn.microsoft.com/en-us/answers/questions/2141487/request-for-gpu-enabled-vm-quota-increase-for-azur) |
| GitHub Student Pack | DigitalOcean left the pack on 2026-07-31. Camber lists 5 GPU hours a month, GPU type unverified | | [changelog](https://github.com/github-education-resources/Student-Developer-Pack-Current-Partners-FAQ/blob/main/SDP-changelog.md) |
| SageMaker Studio Lab | Closed to new customers since 2026-07-30 | | [AWS](https://docs.aws.amazon.com/sagemaker/latest/dg/studio-lab-availability-change.html) |

## What we recommend for the event

1. **Stage default: `overlay`.** It needs no network and cannot fail on stage.
2. **Real render: Modal on an L4 or A10 (24 GB).** No tunnel and no terms problem. $30 covers about 27 to 37 GPU hours. Warm the container before judging, because a cold start downloads several GB of weights.
3. **Free fallback: `hf_space` with `HF_TOKEN` set** to a free Hugging Face account token. That gives 5 min of ZeroGPU a day, which is a handful of renders, so save it for the demo.

We do not recommend Colab or Kaggle with a tunnel: it works, but the terms forbid it.

## Model notes

| Model | License | VRAM, as the authors state it | Weights to download |
| --- | --- | --- | --- |
| Leffa virtual try-on | MIT code and weights, trained on VITON-HD and DressCode, whose dataset terms the authors ask you to follow | 16 GB for try-on alone, 24 GB to be safe; 38 to 40 GB with pose transfer also loaded ([#3](https://github.com/franciszzj/Leffa/issues/3), [#1](https://github.com/franciszzj/Leffa/issues/1)). 6 s per image on an A100 in fp16 (README) | `virtual_tryon.pth` 7.2 GB, plus DensePose, human parsing and OpenPose from `franciszzj/Leffa` |
| CatVTON | CC BY-NC-SA 4.0 for code, weights and demo: non-commercial only | Under 8 GB at 1024x768 in bf16 (README) | Attention weights from `zhengchong/CatVTON` plus SD 1.5 inpainting (about 5 GB) |

Things the upstream code does that matter for ADR 0003:

- CatVTON's `DensePose.__call__` saves the person image to `./densepose_/tmp/` and reads it back. A worker backend must run the predictor on an in-memory array instead.
- CatVTON's demo `app.py` saves every result grid, which includes the person photo, to `resource/demo/output`.
- Leffa's try-on path keeps images in memory; only its unused `AutoMasker` writes temp files.
- Both default to `cuda` in places: detectron2's `MODEL.DEVICE` and Leffa's `LeffaPipeline(device="cuda")`. Neither has been run on Apple silicon for this project.
- Leffa builds the model in fp32 before halving it, so loading `virtual_tryon.pth` can peak near 15 GB of RAM, more than Colab free gives.
- Starlette spools multipart uploads over 1 MB to a temp file on disk. The worker raises `MultiPartParser.spool_max_size` so person photos stay in memory; the engine's API needs the same fix.
