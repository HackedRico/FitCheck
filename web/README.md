# FitCheck web

The phone app: point the camera at a garment or paste a shop link, read the verdict, see the garment on you live or in an AI render, and ask the stylist why. Vite, React and TypeScript, mobile first, installable as a PWA from its manifest.

## Run on a laptop

```sh
make api          # engine on :8000, offline fakes
make web-install  # once
make web          # https://localhost:5173, /api proxies to :8000
```

Accept the self-signed certificate warning once. Point the proxy at another engine with `FITCHECK_ENGINE_URL=http://host:8000`, or call one on another origin directly with `VITE_API_BASE`.

## Run on a phone

The camera needs a secure origin, so the dev server serves HTTPS on every interface.

- Same wifi: open the `Network:` https address `make web` prints and accept the certificate warning.
- Any network: run `FITCHECK_HTTP=1 npm run dev`, then `cloudflared tunnel --url http://localhost:5173` and open the `trycloudflare.com` address. The tunnel adds real HTTPS.

The live preview and the on-device cutouts run MediaPipe models in the browser, loaded from Google's model bucket. The live pose model can be served locally: download `pose_landmarker_lite.task` into `public/models/` and set `VITE_POSE_MODEL_URL=/models/pose_landmarker_lite.task`. The stills pose model, the selfie segmenter and the cutout segmenter still load from Google, so the first scan and the first try-on need the network.

## Regenerate API types

After an engine route or schema change: `make openapi` from the repo root, then `npm run gen:api` here. Never edit `openapi.json` or `src/api/schema.d.ts` by hand.

## Checks

`npm run typecheck` and `npm run build`, which type-checks first.

## File map

| Path | Holds |
| --- | --- |
| `src/App.tsx` | The shell: the welcome on a first visit, then one screen per route, with the pipeline and settings sheets over it |
| `src/api/client.ts` | Every engine call, typed from `schema.d.ts` |
| `src/state/` | App context, settings, location, person photo, pipelines, the outfit, and the scan, verdict and render flow |
| `src/screens/` | Welcome, Home (the camera), Result, Live, You, Closet |
| `src/components/` | Sheets, the in-app camera and photo booth, tag chips, week strip, closet thumbnails, before-and-after slider, stylist chat, outfit tray |
| `src/lib/` | Camera, routing, storage, weather codes, pose loading, fit math, garment cutouts, occlusion, person framing, shared canvas and load-once helpers |
| `src/styles/` | `tokens.css` colours and type, `base.css` reset and primitives, `app.css` shared components, `flow.css` the `fc-` screens |
| `public/` | Manifest and icons (`icons/*.svg` are the sources, PNGs made with `rsvg-convert`) |

There is no service worker on purpose: a cached app shell serves stale builds, and a service worker cannot register on a self-signed certificate.

## Packages and licenses

| Package | License |
| --- | --- |
| react, react-dom | MIT |
| openapi-fetch | MIT |
| @mediapipe/tasks-vision and its Pose Landmarker lite and full, selfie multiclass and Interactive Segmenter (MagicTouch) models | Apache-2.0 |
| @fontsource/instrument-sans | MIT package, font OFL-1.1 |
| vite, @vitejs/plugin-react, @vitejs/plugin-basic-ssl | MIT |
| typescript | Apache-2.0 |
| openapi-typescript | MIT |
| @types/react, @types/react-dom | MIT |

Weather on the week strip comes from Open-Meteo under CC BY 4.0; the strip shows its attribution.
