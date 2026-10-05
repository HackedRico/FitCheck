# Try-on without a GPU

A render paints the garment onto a person photo with a diffusion model. FitCheck picks the renderer with `FITCHECK_TRYON`:

| Value | Runs on | Person photo goes to |
| --- | --- | --- |
| `overlay` (default) | this machine, Pillow only, stamped "preview" | nowhere |
| `hf_space` | the public [`franciszzj/Leffa`](https://huggingface.co/spaces/franciszzj/Leffa) Space on Hugging Face ZeroGPU | Hugging Face, so the UI warns |
| `remote` | the worker in `worker/` on a machine you run | that worker |

## The setup we use

```sh
# engine/.env
FITCHECK_TRYON=hf_space
FITCHECK_TRYON_FALLBACK=overlay
HF_TOKEN=hf_...   # a free read token from https://huggingface.co/settings/tokens
```

The engine reads `HF_TOKEN` (or `FITCHECK_HF_TOKEN`) from `engine/.env` itself, so it need not be exported in the shell. Without a token the Space runs out after one or two renders a day.

ZeroGPU gives each caller a daily quota: 2 minutes anonymous, 5 with a free account, 40 with PRO ([docs](https://huggingface.co/docs/hub/spaces-zerogpu), checked 2026-10-04). The Leffa Space asks for 180 seconds per call, so a call starts only while that much quota is left.

When the Space is unavailable, because the quota is spent, the queue is full or a call times out after `FITCHECK_TRYON_TIMEOUT_S` (180), the engine renders with the fallback and skips the Space for `FITCHECK_TRYON_FALLBACK_COOLDOWN_S` seconds (300). The answer carries `fallback: true`. The web app then builds a try-on on the phone instead, mapping the garment onto the owner's shoulders or hips with MediaPipe Pose, and labels it a preview.

## Your own GPU

`worker/` is a small FastAPI service the `remote` adapter calls. Only the `echo` backend ships today, which proves the wire format with no GPU; `worker/README.md` has the contract. A Leffa backend would follow `LeffaPredictor.leffa_predict` in the [Leffa repo](https://github.com/franciszzj/Leffa). Things to know before writing one:

- Leffa try-on needs about 16 GB of VRAM, 24 GB to be safe ([#3](https://github.com/franciszzj/Leffa/issues/3)). `virtual_tryon.pth` is 7.2 GB, plus DensePose, human parsing and OpenPose checkpoints.
- Leffa builds the model in fp32 before halving it, so loading can peak near 15 GB of RAM.
- Leffa's try-on path keeps images in memory; only its unused `AutoMasker` writes temp files (ADR 0003).
- It defaults to `cuda` in `LeffaPipeline(device="cuda")` and has not been run on Apple silicon for this project.
- A pay-as-you-go GPU host such as [Modal](https://modal.com/pricing) works without a tunnel. A worker on Colab or Kaggle needs a tunnel, which [Colab's terms](https://research.google.com/colaboratory/faq.html) forbid and Kaggle users report bans for.

Third-party code and weights go in the git-ignored `worker/vendor/` and `worker/weights/`.
