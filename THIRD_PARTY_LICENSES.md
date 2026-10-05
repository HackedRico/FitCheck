# Third-party licenses

FitCheck's own code is Apache 2.0 (see `LICENSE`). It downloads or calls the models, services and assets below at run time. No third-party weights or code are committed here, except the demo photos. Every model is open weight. None meets the OSI Open Source AI Definition, which also asks for training data.

"Where it runs" uses the same words as `runs_on` in the pipeline panel: the phone means the browser on the device, this machine means the computer running the engine, and a public API means someone else's server.

## Models

| Component | Used for | License | Where it runs |
| --- | --- | --- | --- |
| [Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) | Garment tags and closet scan | Apache 2.0 | Public API ([Featherless](https://featherless.ai)) by default, or your own Ollama, vLLM or llama.cpp server |
| [Qwen3-30B-A3B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507) | Stylist chat | Apache 2.0 | Public API (Featherless) by default, or your own server |
| [Leffa](https://huggingface.co/franciszzj/Leffa) ([code](https://github.com/franciszzj/Leffa)) | Try-on render | MIT code and weights. Trained on [VITON-HD](https://github.com/shadow2496/VITON-HD) (CC BY-NC 4.0) and [DressCode](https://github.com/aimagelab/dress-code) (non-commercial research license), whose terms the authors ask you to follow | Public API: the [franciszzj/Leffa](https://huggingface.co/spaces/franciszzj/Leffa) Hugging Face Space, under the [Hugging Face terms](https://huggingface.co/terms-of-service) |
| [rembg](https://github.com/danielgatis/rembg) with [IS-Net](https://github.com/xuebinqin/DIS) `isnet-general-use` | Garment cutout | MIT code, Apache 2.0 model | This machine |
| [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker), lite and full | Live preview, framing the person photo, on-device try-on | Apache 2.0 | The phone |
| [MediaPipe selfie multiclass segmenter](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter) | Lifting clothes off a model in a shop photo, hair and skin occlusion in the live preview | Apache 2.0 | The phone |
| [MediaPipe Interactive Segmenter](https://ai.google.dev/edge/mediapipe/solutions/vision/interactive_segmenter) (MagicTouch) | Garment cutout in the browser | Apache 2.0 | The phone |
| [Llama 3.3 70B](https://www.llama.com/llama3_3/license/) via Snowflake Cortex | Stylist on the Snowflake path | Llama 3.3 Community License | Snowflake |

The MediaPipe model files load from `storage.googleapis.com` the first time the web app needs them, then run in the browser. No image is sent there.

## Services and software

| Component | Used for | License | Where it runs |
| --- | --- | --- | --- |
| [Open-Meteo](https://open-meteo.com) | Forecast | CC BY 4.0 data, AGPL-3.0 code; free API for non-commercial use | Public API; the UI credits "Weather data by Open-Meteo.com" |
| [gradio_client](https://github.com/gradio-app/gradio) | Calling the Leffa Space | Apache 2.0 | This machine |
| [SQLite](https://sqlite.org/copyright.html) | Default closet store, `.fitcheck/closet.db` | Public domain | This machine |
| [PostgreSQL](https://www.postgresql.org/about/licence/) with [pgvector](https://github.com/pgvector/pgvector) | Closet store on the open path | PostgreSQL License | This machine, in Docker |
| [Snowflake](https://www.snowflake.com), Cortex Search, AI_COMPLETE | Closet store, search and stylist on the Snowflake path | Proprietary | Snowflake |

## Assets

| Component | License | Details |
| --- | --- | --- |
| Demo closet photos from Wikimedia Commons | CC BY-SA, CC BY and public domain, per file | Source, author, license and changes for each file in [`demo/images/ATTRIBUTION.md`](demo/images/ATTRIBUTION.md) |
| Web fonts and npm packages | MIT, Apache 2.0, OFL-1.1 | Listed in [`web/README.md`](web/README.md) |
