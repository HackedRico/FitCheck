# Try-on worker

A small FastAPI service the engine's `RemoteRenderer` calls when `FITCHECK_TRYON=remote`.

```sh
cd worker
WORKER_TOKEN=pick-a-secret uv run fitcheck-worker   # http://127.0.0.1:8008
uv run pytest -q
```

Then run the engine with `FITCHECK_TRYON=remote`, `FITCHECK_TRYON_WORKER_URL=http://127.0.0.1:8008` and `FITCHECK_TRYON_WORKER_TOKEN=pick-a-secret`.

## Contract

- `GET /health` returns `backend`, `model`, `license`, `device` and `ready`.
- `POST /render` takes multipart `person` and `garment` files, `region` (`upper`, `lower` or `full`) and an optional `seed`, and answers `image/png`. It answers 401 for a wrong token, 413 for an upload over `WORKER_MAX_UPLOAD_MB`, 422 for bad input and 503 while the model loads.

Env vars: `WORKER_BACKEND` (default `echo`), `WORKER_TOKEN`, `WORKER_HOST` (default `127.0.0.1`), `WORKER_PORT` (default `8008`), `WORKER_MAX_UPLOAD_MB` (default 15).

## Backends

Only `echo` ships today: a Pillow composite that proves the wire format with no GPU. A Leffa backend would follow `LeffaPredictor.leffa_predict` in the Leffa repo's `app.py`; `docs/gpu.md` lists what that code does with person photos and devices. Third-party code and weights go in the git-ignored `vendor/` and `weights/` folders, never in git.

The worker never writes the person photo to disk and never logs request bodies (ADR 0003).
