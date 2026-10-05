# FitCheck web

The phone app: scan a candidate, read the verdict, see it on you live, render it, ask the stylist. Vite, React and TypeScript, mobile first, installable as a PWA from its manifest.

## Run on a laptop

```sh
make api          # engine on :8000, offline fakes
make web-install  # once
make web          # https://localhost:5173, /api proxies to :8000
```

Accept the self-signed certificate warning once. Point the proxy at another engine with `FITCHECK_ENGINE_URL=http://host:8000`.

## Run on a phone

The camera needs a secure origin, so the dev server serves HTTPS on every interface.

- Same wifi: open the `Network:` https address `make web` prints and accept the certificate warning.
- Any network: run `FITCHECK_HTTP=1 npm run dev`, then `cloudflared tunnel --url http://localhost:5173` and open the `trycloudflare.com` address. The tunnel adds real HTTPS.

The live preview loads its models from Google's model bucket: the pose model, a segmenter that cuts garments out of their photos, and one that keeps your face, hair and hands in front of them. For an offline stage, download `pose_landmarker_lite.task` into `public/models/` and set `VITE_POSE_MODEL_URL=/models/pose_landmarker_lite.task`.

## Regenerate API types

After an engine route or schema change: `make openapi` from the repo root, then `npm run gen:api` here. Never edit `openapi.json` or `src/api/schema.d.ts` by hand.

## Checks

`npm run typecheck` and `npm run build` (which type-checks first).

## File map

| Path | Holds |
| --- | --- |
| `src/api/client.ts` | Every engine call, typed from `schema.d.ts` |
| `src/state/` | App context, settings, location, person photo, pipelines, the scan-verdict-render flow |
| `src/lib/` | Camera, pose loading, landmark fit math, cutout keying, weather codes, storage |
| `src/screens/` | Scan, Live, Me, Closet, Render |
| `src/components/` | Verdict hang tag, tag chips, progress rail, week strip, before/after slider, sheets |
| `src/styles/` | Tokens, base, layout |
| `public/` | Manifest and icons (`icons/*.svg` are the sources, PNGs made with `rsvg-convert`) |

There is no service worker on purpose: a cached app shell serves stale builds during a hackathon, and a service worker cannot register on a self-signed certificate.

## Packages and licenses

| Package | License |
| --- | --- |
| react, react-dom | MIT |
| openapi-fetch | MIT |
| @mediapipe/tasks-vision (and the Pose Landmarker lite model) | Apache-2.0 |
| @fontsource/big-shoulders-display, instrument-serif, instrument-sans, dm-mono | MIT packages, fonts OFL-1.1 |
| vite, @vitejs/plugin-react, @vitejs/plugin-basic-ssl | MIT |
| typescript | Apache-2.0 |
| openapi-typescript | MIT |
| @types/react, @types/react-dom | MIT |
