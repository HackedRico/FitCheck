from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from fitcheck.domain import GarmentTags, Location, PipelineStep, TryOnRegion
from fitcheck.engine import Engine
from fitcheck.errors import AdapterUnavailable, FitCheckError, InvalidInput, NotFound
from fitcheck.settings import Settings

# Exit codes an agent can branch on without parsing stderr
_EXIT_BY_ERROR: dict[type[FitCheckError], int] = {
    InvalidInput: 2,
    NotFound: 4,
    AdapterUnavailable: 3,
}

# =============================================================================
# Module Overview
# =============================================================================
# The `fitcheck` command. `serve` runs the HTTP API and `openapi` writes its contract;
# the rest drive the `Engine` directly and print JSON to stdout, so an agent skill or
# a teammate's script can scan, judge and manage a closet from a shell. Adapters come
# from the same `FITCHECK_*` env vars as the server.


def main(argv: list[str] | None = None) -> None:
    """Parse `argv`, run one `fitcheck` subcommand, and exit non-zero on a FitCheck error."""
    args = _parser().parse_args(argv)
    try:
        args.run(args)
    except FitCheckError as exc:
        print(f"error: {exc}", file=sys.stderr)
        code = next((c for cls, c in _EXIT_BY_ERROR.items() if isinstance(exc, cls)), 1)
        raise SystemExit(code) from exc


# =============================================================================
# Argument parsing
# =============================================================================


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fitcheck",
        description="FitCheck engine. Commands print JSON; adapters come from FITCHECK_* env vars.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def command(name: str, run: Callable[[argparse.Namespace], None], help_: str) -> Any:
        p = sub.add_parser(name, help=help_, description=help_)
        p.set_defaults(run=run)
        return p

    serve = command("serve", _serve, "Run the HTTP API")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true")

    openapi = command("openapi", _openapi, "Write the OpenAPI contract as JSON")
    openapi.add_argument("out", type=Path)

    command("health", _health, "Show the adapter in every slot")

    scan = command("scan", _scan, "Cut out and tag a garment photo; stores nothing")
    scan.add_argument("image", type=Path)
    scan.add_argument("--cutout", type=Path, help="Also write the cutout PNG here")

    judge = command("judge", _judge, "Verdict for a candidate: BUY, SKIP or TRY_WITH")
    source = judge.add_mutually_exclusive_group(required=True)
    source.add_argument("--image", type=Path, help="Garment photo to scan first")
    source.add_argument("--tags", help="GarmentTags as JSON, to skip the scan")
    source.add_argument("--url", help="Shop or image link for a garment not owned yet")
    _owner_and_location(judge)

    week = command("week", _week, "Forecast and calendar for the coming days")
    _owner_and_location(week)

    chat = command("chat", _chat, "Ask the stylist one question about the closet")
    chat.add_argument("message")
    chat.add_argument("--tags", help="Candidate GarmentTags as JSON, to ask about a scan")
    _owner_and_location(chat)

    render = command("render", _render, "Render a garment on a person photo")
    render.add_argument("person", type=Path)
    render.add_argument("garment", type=Path)
    render.add_argument("--region", type=TryOnRegion, choices=list(TryOnRegion), required=True)
    render.add_argument("--out", type=Path, required=True)

    closet = command("closet", _closet_list, "List the closet")
    _owner(closet)

    add = command("add", _closet_add, "Add a garment photo to the closet")
    add.add_argument("image", type=Path)
    add.add_argument("--tags", help="GarmentTags as JSON; omit to auto-tag")
    add.add_argument("--price", type=Decimal)
    _owner(add)

    forget = command("forget", _forget, "Delete every garment and image for an owner")
    forget.add_argument("--yes", action="store_true", required=True, help="Confirm the delete")
    _owner(forget)

    seed = command("seed", _seed, "Load the seed closet into the configured store")
    seed.add_argument("--file", type=Path, help="Seed file; defaults to FITCHECK_SEED_PATH")
    return parser


def _owner(p: argparse.ArgumentParser) -> None:
    p.add_argument("--owner", help="Defaults to FITCHECK_DEFAULT_OWNER")


def _owner_and_location(p: argparse.ArgumentParser) -> None:
    _owner(p)
    p.add_argument("--lat", type=float)
    p.add_argument("--lon", type=float)


# =============================================================================
# Commands
# =============================================================================


def _serve(args: argparse.Namespace) -> None:
    import uvicorn

    uvicorn.run(
        "fitcheck.api.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


def _openapi(args: argparse.Namespace) -> None:
    from fitcheck.api.app import create_app

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(create_app().openapi(), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}", file=sys.stderr)


def _health(args: argparse.Namespace) -> None:
    _emit(_engine().adapters())


def _scan(args: argparse.Namespace) -> None:
    result = _engine().scan(_read(args.image))
    if args.cutout:
        args.cutout.write_bytes(result.cutout_png)
    _emit({"tags": result.tags, "pipeline": result.pipeline})


def _judge(args: argparse.Namespace) -> None:
    engine = _engine()
    pipeline: list[PipelineStep] = []
    if args.image or args.url:
        if args.url:
            linked = engine.import_link(args.url)
            image, pipeline = linked.image_png, list(linked.pipeline)
        else:
            image = _read(args.image)
        scanned = engine.scan(image)
        tags, pipeline = scanned.tags, [*pipeline, *scanned.pipeline]
    else:
        tags = _parse_tags(args.tags)
    result = engine.judge(_owner_of(args), tags, _location_of(args))
    _emit(
        {
            "tags": tags,
            "verdict": result.verdict,
            "week": result.week,
            "pipeline": [*pipeline, *result.pipeline],
        }
    )


def _week(args: argparse.Namespace) -> None:
    result = _engine().week(_owner_of(args), _location_of(args))
    _emit({"week": result.week, "pipeline": result.pipeline})


def _chat(args: argparse.Namespace) -> None:
    candidate = _parse_tags(args.tags) if args.tags else None
    result = _engine().chat(
        _owner_of(args), args.message, candidate=candidate, location=_location_of(args)
    )
    _emit({"reply": result.reply, "pipeline": result.pipeline})


def _render(args: argparse.Namespace) -> None:
    result = _engine().render(_read(args.person), _read(args.garment), args.region)
    args.out.write_bytes(result.image_png)
    _emit(
        {
            "out": str(args.out),
            "cached": result.cached,
            "fallback": result.fallback,
            "pipeline": result.pipeline,
        }
    )


def _closet_list(args: argparse.Namespace) -> None:
    _emit(_engine().closet(_owner_of(args)))


def _closet_add(args: argparse.Namespace) -> None:
    tags = _parse_tags(args.tags) if args.tags else None
    result = _engine().add_to_closet(
        _owner_of(args), _read(args.image), tags=tags, price=args.price
    )
    _emit({"garment": result.garment, "pipeline": result.pipeline})


def _forget(args: argparse.Namespace) -> None:
    _emit({"deleted": _engine().forget(_owner_of(args))})


def _seed(args: argparse.Namespace) -> None:
    from fitcheck.seed import load_seed

    path = args.file or Settings().seed_path
    if path is None or not path.is_file():
        raise InvalidInput(
            f"Seed file `{path}` not found; pass `--file` or set FITCHECK_SEED_PATH."
        )
    store = _engine().ports.store
    garments = load_seed(path)
    for garment in garments:
        store.save(garment)
    _emit({"seeded": len(garments), "store": store.info.name, "file": str(path)})


# =============================================================================
# Helpers
# =============================================================================


def _engine() -> Engine:
    from fitcheck.wiring import build_engine

    return build_engine(Settings())


def _owner_of(args: argparse.Namespace) -> str:
    return str(args.owner or Settings().default_owner)


def _location_of(args: argparse.Namespace) -> Location | None:
    if args.lat is None and args.lon is None:
        return None
    if args.lat is None or args.lon is None:
        raise InvalidInput("Pass both `--lat` and `--lon`, or neither.")
    try:
        return Location(latitude=args.lat, longitude=args.lon)
    except ValueError as exc:
        raise InvalidInput(
            "`--lat` must be within -90 to 90 and `--lon` within -180 to 180."
        ) from exc


def _read(path: Path) -> bytes:
    if not path.is_file():
        raise InvalidInput(f"No file at `{path}`.")
    return path.read_bytes()


def _parse_tags(raw: str) -> GarmentTags:
    try:
        return GarmentTags.model_validate_json(raw)
    except ValueError as exc:
        raise InvalidInput(f"`--tags` is not valid GarmentTags JSON: {exc}") from exc


def _emit(value: Any) -> None:
    """Print `value` as indented JSON, serializing pydantic models in JSON mode."""
    print(json.dumps(_jsonable(value), indent=2, default=str))


def _jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(v) for v in value]
    return value
