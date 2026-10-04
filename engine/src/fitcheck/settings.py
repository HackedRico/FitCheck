from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import SecretStr
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
    store: Literal["memory", "postgres", "snowflake"] = "memory"
    tagger: Literal["fake", "openai_compat"] = "fake"
    cutout: Literal["none", "rembg"] = "none"
    tryon: Literal["overlay", "remote", "hf_space"] = "overlay"
    weather: Literal["fixture", "open_meteo"] = "fixture"
    calendar: Literal["none", "fixture", "ics"] = "fixture"
    stylist: Literal["template", "openai_compat", "cortex"] = "template"

    # ---------- engine ----------
    # Garment images only; person photos are never written here or anywhere else
    data_dir: Path = _REPO_ROOT / ".fitcheck"
    seed_path: Path | None = _REPO_ROOT / "demo" / "closet.json"
    default_owner: str = "maya"
    default_latitude: float = 40.7128
    default_longitude: float = -74.0060
    default_location_name: str = "New York"
    forecast_days: int = 7
    cors_origins: list[str] = ["*"]

    # ---------- open path ----------
    database_url: str = "postgresql://fitcheck:fitcheck@localhost:5432/fitcheck"
    tryon_worker_url: str | None = None
    tryon_worker_token: SecretStr | None = None
    # Public Hugging Face Space for try-on without a GPU; sends the person photo off this machine
    tryon_hf_space: str = "franciszzj/Leffa"
    # Diffusion try-on takes seconds on a warm GPU and minutes on a cold Space or tunnel
    tryon_timeout_s: float = 180.0
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
    snowflake_stage: str = "FITCHECK_IMAGES"
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
