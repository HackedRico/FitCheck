from __future__ import annotations

import argparse
import json
from pathlib import Path

# =============================================================================
# Module Overview
# =============================================================================
# The `fitcheck` command. `serve` runs the HTTP API; `openapi` writes the API
# contract that the web app generates its types from. Agent-facing commands
# (scan, judge, closet) are added here so skills can drive the engine from a shell.


def main(argv: list[str] | None = None) -> None:
    """Parse `argv` and run one `fitcheck` subcommand."""
    parser = argparse.ArgumentParser(prog="fitcheck", description="FitCheck engine")
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="Run the HTTP API")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true")

    openapi = sub.add_parser("openapi", help="Write the OpenAPI contract as JSON")
    openapi.add_argument("out", type=Path)

    args = parser.parse_args(argv)
    if args.command == "serve":
        import uvicorn

        uvicorn.run(
            "fitcheck.api.app:create_app",
            factory=True,
            host=args.host,
            port=args.port,
            reload=args.reload,
        )
    elif args.command == "openapi":
        from fitcheck.api.app import create_app

        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(create_app().openapi(), indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.out}")
