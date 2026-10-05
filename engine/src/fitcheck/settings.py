from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from fitcheck.domain import Location, RunsOn

# Repo root, so the demo closet resolves no matter which folder the server starts from
_REPO_ROOT = Path(__file__).resolve().parents[3]

# =============================================================================
# Module Overview
# =============================================================================
# Every knob the engine reads, loaded from `FITCHECK_*` env vars or `engine/.env`.
# The slot fields (`store`, `tagger`, ...) pick one adapter each; `wiring` maps the
# names to modules. Defaults run fully offline with fakes, so a fresh clone boots.


class Settings(BaseSettings):
    """Engine configuration; one field per env var `FITCHECK_<FIELD>`."""

    # An absolute path, so the CLI and the skill pick up engine/.env from any working folder
    model_config = SettingsConfigDict(
        env_prefix="FITCHECK_", env_file=_REPO_ROOT / "engine" / ".env", extra="ignore"
    )

    # ---------- adapter slots ----------
    # sqlite keeps closets across restarts with no server; memory forgets them on exit
    store: Literal["sqlite", "memory", "postgres", "snowflake"] = "sqlite"
    tagger: Literal["fake", "openai_compat"] = "fake"
    cutout: Literal["none", "rembg"] = "none"
    tryon: Literal["overlay", "remote", "hf_space"] = "overlay"
    # Second try-on adapter, used while the first is unavailable; `none` lets the error through
    tryon_fallback: Literal["none", "overlay", "remote", "hf_space"] = "none"
    weather: Literal["fixture", "open_meteo"] = "fixture"
    calendar: Literal["none", "fixture", "ics"] = "fixture"
    stylist: Literal["template", "openai_compat", "cortex"] = "template"

    # ---------- engine ----------
    # Garment images only; person photos are never written here or anywhere else
    data_dir: Path = _REPO_ROOT / ".fitcheck"
    seed_path: Path | None = _REPO_ROOT / "demo" / "closet.json"
    default_owner: str = "ricky"
    default_latitude: float = 40.7128
    default_longitude: float = -74.0060
    default_location_name: str = "New York"
    forecast_days: int = 7
    # The API has no accounts, so the browsers allowed to call it are the whole guard.
    # `*` would let any page someone visits read and delete their closet, so the default
    # is the dev server; `cors_origin_regex` adds the phone and tunnel origins.
    cors_origins: list[str] = ["http://localhost:5173", "https://localhost:5173"]
    # Private network addresses and the tunnels `web/README.md` suggests, on any port
    cors_origin_regex: str = (
        r"https?://(localhost|127\.0\.0\.1|\[::1\]"
        r"|10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+"
        r"|[a-z0-9-]+\.trycloudflare\.com|[a-z0-9-]+\.ngrok-free\.app|[a-z0-9-]+\.loca\.lt)"
        r"(:[0-9]+)?"
    )

    # ---------- open path ----------
    database_url: str = "postgresql://fitcheck:fitcheck@localhost:5432/fitcheck"
    tryon_worker_url: str | None = None
    tryon_worker_token: SecretStr | None = None
    # Public Hugging Face Space for try-on without a GPU; sends the person photo off this machine
    tryon_hf_space: str = "franciszzj/Leffa"
    # A free Hugging Face read token raises the Space's daily GPU allowance; anonymous calls run
    # out after one or two renders. Read here because engine/.env never reaches os.environ.
    hf_token: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("FITCHECK_HF_TOKEN", "HF_TOKEN")
    )
    # Diffusion try-on takes seconds on a warm GPU and minutes on a cold Space or tunnel
    tryon_timeout_s: float = 180.0
    # How long to skip a failed try-on adapter before trying it again
    tryon_fallback_cooldown_s: float = 300.0
    # A private iCal address is a credential: anyone holding it can read the calendar
    calendar_ics_url: SecretStr | None = None

    # ---------- OpenAI-compatible model endpoints ----------
    # Any server speaking the OpenAI chat API works: Featherless, OpenRouter, Groq, or our
    # own vLLM, llama.cpp or Ollama server (`http://localhost:11434/v1`). Vision and chat
    # are separate so each can use the best open-weight model its host offers.
    vision_base_url: str = "https://api.featherless.ai/v1"
    vision_api_key: SecretStr | None = None
    vision_model: str = "Qwen/Qwen3-VL-8B-Instruct"
    # Where the vision model runs, for the pipeline panel; inferred from the URL when unset
    vision_runs_on: RunsOn | None = None
    chat_base_url: str = "https://api.featherless.ai/v1"
    chat_api_key: SecretStr | None = None
    chat_model: str = "Qwen/Qwen3-30B-A3B-Instruct-2507"
    chat_runs_on: RunsOn | None = None
    llm_timeout_s: float = 60.0

    # ---------- Snowflake path ----------
    snowflake_account: str | None = None
    snowflake_user: str | None = None
    snowflake_password: SecretStr | None = None
    snowflake_private_key_path: Path | None = None
    # Set only when the key file is encrypted (`openssl pkcs8 -v2 aes-256-cbc`)
    snowflake_private_key_passphrase: SecretStr | None = None
    snowflake_role: str | None = None
    snowflake_warehouse: str = "FITCHECK_WH"
    snowflake_database: str = "FITCHECK"
    snowflake_schema: str = "PUBLIC"
    # llama4-maverick went legacy in August 2026; new accounts cannot start it
    cortex_model: str = "llama3.3-70b"
    cortex_search_service: str = "CLOSET_SEARCH"

    @property
    def default_location(self) -> Location:
        """The location used when a client sends none."""
        return Location(
            latitude=self.default_latitude,
            longitude=self.default_longitude,
            name=self.default_location_name,
        )
