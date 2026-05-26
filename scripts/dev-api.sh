#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgres://cl8y_legal:cl8y_legal@localhost:5432/cl8y_legal}"
export TERMS_FILE_PATH="${TERMS_FILE_PATH:-$ROOT/TERMS_AND_CONDITIONS.txt}"

if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

cd api
exec cargo run
