from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from fitcheck.domain import Location

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

    model_config = SettingsConfigDict(env_prefix="FITCHECK_", env_file=".env", extra="ignore")

    # ---------- adapter slots ----------
    store: Literal["memory", "postgres", "snowflake"] = "memory"
    tagger: Literal["fake", "ollama", "cortex"] = "fake"
    cutout: Literal["none", "rembg"] = "none"
    tryon: Literal["overlay", "remote", "hf_space"] = "overlay"
    weather: Literal["fixture", "open_meteo"] = "fixture"
    calendar: Literal["none", "fixture", "ics"] = "fixture"
    stylist: Literal["template", "ollama", "cortex"] = "template"

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
    ollama_host: str = "http://localhost:11434"
    ollama_vision_model: str = "qwen3-vl:8b"
    ollama_chat_model: str = "qwen3-vl:8b"
    tryon_worker_url: str | None = None
    tryon_worker_token: SecretStr | None = None
    # Public Hugging Face Space for try-on without a GPU; sends the person photo off this machine
    tryon_hf_space: str = "franciszzj/Leffa"
    # A private iCal address is a credential: anyone holding it can read the calendar
    calendar_ics_url: SecretStr | None = None

    # ---------- Snowflake path ----------
    snowflake_account: str | None = None
    snowflake_user: str | None = None
    snowflake_password: SecretStr | None = None
    snowflake_private_key_path: Path | None = None
    snowflake_role: str | None = None
    snowflake_warehouse: str = "FITCHECK_WH"
    snowflake_database: str = "FITCHECK"
    snowflake_schema: str = "PUBLIC"
    snowflake_stage: str = "FITCHECK_IMAGES"
    cortex_model: str = "llama4-maverick"
    cortex_search_service: str = "CLOSET_SEARCH"

    @property
    def default_location(self) -> Location:
        """The location used when a client sends none."""
        return Location(
            latitude=self.default_latitude,
            longitude=self.default_longitude,
            name=self.default_location_name,
        )
