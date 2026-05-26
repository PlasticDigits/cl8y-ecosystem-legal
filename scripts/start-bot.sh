#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/bot/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/bot/.env"
  set +a
fi

echo "Waiting for Postgres at 127.0.0.1:5432…"
for _ in $(seq 1 120); do
  if (echo >/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
    break
  fi
  sleep 2
done
if ! (echo >/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "Postgres is not reachable. Start it first, for example:"
  echo "  sudo systemctl start postgresql"
  echo "  # or: docker compose -f $ROOT/docker-compose.yml up -d"
  exit 1
fi

echo "Applying API migrations (if needed)…"
(
  cd "$ROOT/api"
  export DATABASE_URL="${DATABASE_URL:-postgres://cl8y_legal:cl8y_legal@127.0.0.1:5432/cl8y_legal}"
  export TERMS_SYNC_ON_STARTUP=false
  timeout 25 cargo run -q 2>/dev/null || true
)

echo "Starting cl8y-terms-bot…"
cd "$ROOT/bot"
exec cargo run --release
