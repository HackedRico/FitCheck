#!/usr/bin/env bash
# Run the FitCheck CLI from anywhere: finds the engine next to this skill and passes every argument through.
# Set FITCHECK_ENGINE_DIR when the skill is installed outside the FitCheck repo.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
engine="${FITCHECK_ENGINE_DIR:-$here/../../../engine}"

if [[ ! -f "$engine/pyproject.toml" ]]; then
  echo "error: FitCheck engine not found at $engine; set FITCHECK_ENGINE_DIR to the repo's engine/ folder." >&2
  exit 2
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "error: uv is not installed; see https://docs.astral.sh/uv/ to install it." >&2
  exit 2
fi

# `--project` keeps the caller's working folder, so relative photo paths still resolve
exec uv run --project "$engine" --quiet fitcheck "$@"
