# Third-party licenses

FitCheck's own code is Apache 2.0 (see `LICENSE`). It downloads or calls the models and services below at run time; none of their weights or code are committed here. All models are open weight. None meets the OSI Open Source AI Definition, which also asks for training data.

| Component | Used for | License | Where it runs |
| --- | --- | --- | --- |
| [Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) | Garment tagging | Apache 2.0 | Featherless, or our own server |
| [Qwen3-30B-A3B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507) | Stylist chat | Apache 2.0 | Featherless, or our own server |
| [rembg](https://github.com/danielgatis/rembg) with isnet-general-use | Garment cutout | MIT code, Apache 2.0 model | This machine |
| [Leffa](https://huggingface.co/franciszzj/Leffa) | Try-on render | MIT weights; trained on VITON-HD and DressCode, whose research terms apply | Public Hugging Face Space or our GPU worker |
| [CatVTON](https://github.com/Zheng-Chong/CatVTON) | Try-on render, worker option | CC BY-NC-SA 4.0, non-commercial | Our GPU worker |
| [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) | Live preview | Apache 2.0 | The phone's browser |
| [Open-Meteo](https://open-meteo.com) | Forecast | CC BY 4.0 data, AGPL-3.0 code | Public API; weather data by Open-Meteo.com |
| [Llama 3.3 70B](https://www.llama.com/llama3_3/license/) via Snowflake Cortex | Stylist on the Snowflake path | Llama 3.3 Community License, open weight | Snowflake |
| Snowflake, Cortex Search, AI_COMPLETE | Closet store and search on the Snowflake path | Proprietary | Snowflake |
| PostgreSQL with pgvector | Closet store on the open path | PostgreSQL License | Docker |

Web app packages and their licenses are listed in `web/README.md`.
