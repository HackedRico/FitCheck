from __future__ import annotations

import importlib
from typing import Any

from fitcheck.engine import Engine, Ports
from fitcheck.ports import TryOnRenderer
from fitcheck.settings import Settings
from fitcheck.tryon.fallback import FallbackRenderer

# =============================================================================
# Module Overview
# =============================================================================
# Builds an `Engine` from `Settings`. `ADAPTERS` maps each slot and env value to the
# module that implements it; every adapter module exposes `build(settings)`. Modules
# load lazily, so the Snowflake connector is only imported when the Snowflake path runs.

ADAPTERS: dict[str, dict[str, str]] = {
    "store": {
        "sqlite": "fitcheck.closet.sqlite",
        "memory": "fitcheck.closet.memory",
        "postgres": "fitcheck.closet.postgres",
        "snowflake": "fitcheck.closet.snowflake",
    },
    "tagger": {
        "fake": "fitcheck.vision.fake",
        "openai_compat": "fitcheck.vision.openai_compat",
    },
    "cutout": {
        "none": "fitcheck.vision.cutout_none",
        "rembg": "fitcheck.vision.cutout_rembg",
    },
    "tryon": {
        "overlay": "fitcheck.tryon.overlay",
        "remote": "fitcheck.tryon.remote",
        "hf_space": "fitcheck.tryon.hf_space",
    },
    "weather": {
        "fixture": "fitcheck.context.weather_fixture",
        "open_meteo": "fitcheck.context.open_meteo",
    },
    "calendar": {
        "none": "fitcheck.context.calendar_none",
        "fixture": "fitcheck.context.calendar_fixture",
        "ics": "fitcheck.context.ics",
    },
    "stylist": {
        "template": "fitcheck.stylist.template",
        "openai_compat": "fitcheck.stylist.openai_compat",
        "cortex": "fitcheck.stylist.cortex",
    },
}


def build_engine(settings: Settings | None = None) -> Engine:
    """Return an `Engine` with one adapter per slot, chosen by `settings`."""
    settings = settings or Settings()
    ports = Ports(
        store=_build("store", settings.store, settings),
        tagger=_build("tagger", settings.tagger, settings),
        cutter=_build("cutout", settings.cutout, settings),
        renderer=_build_renderer(settings),
        weather=_build("weather", settings.weather, settings),
        calendar=_build("calendar", settings.calendar, settings),
        stylist=_build("stylist", settings.stylist, settings),
    )
    return Engine(
        ports,
        data_dir=settings.data_dir,
        default_location=settings.default_location,
        forecast_days=settings.forecast_days,
        seed_images_dir=settings.seed_path.parent / "images" if settings.seed_path else None,
    )


def _build_renderer(settings: Settings) -> TryOnRenderer:
    """Return the try-on adapter, wrapped with its fallback when one is set."""
    primary: TryOnRenderer = _build("tryon", settings.tryon, settings)
    if settings.tryon_fallback in ("none", settings.tryon):
        return primary
    backup = _build("tryon", settings.tryon_fallback, settings)
    return FallbackRenderer(primary, backup, cooldown_s=settings.tryon_fallback_cooldown_s)


def _build(slot: str, name: str, settings: Settings) -> Any:
    """Import the adapter module for `slot`=`name` and call its `build(settings)`."""
    try:
        module_path = ADAPTERS[slot][name]
    except KeyError as exc:
        choices = ", ".join(sorted(ADAPTERS.get(slot, {})))
        raise ValueError(f"Unknown {slot} adapter `{name}`; pick one of: {choices}.") from exc
    return importlib.import_module(module_path).build(settings)
