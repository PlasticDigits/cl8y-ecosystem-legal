#!/usr/bin/env bash
# Register (upsert) a Legal property via authenticated POST /admin/properties.
#
# The admin Bearer token is read interactively as a hidden password.
# ADMIN_TOKEN from the environment is intentionally ignored (do not export secrets into shells).
#
# Usage:
#   ./scripts/register-property.sh dex.cl8y.com
#   ./scripts/register-property.sh dex.cl8y.com "CL8Y DEX"
#   API_URL=http://127.0.0.1:8080 ./scripts/register-property.sh dex.cl8y.com
#
# Then list to confirm:
#   ./scripts/register-property.sh --list
set -euo pipefail

API_URL="${API_URL:-https://api.terms.cl8y.com}"
LIST_ONLY=0
PROPERTY=""
DISPLAY_NAME=""

usage() {
  cat <<'EOF' >&2
Usage:
  scripts/register-property.sh <property> [display_name]
  scripts/register-property.sh --list

Env:
  API_URL   Legal API base (default https://api.terms.cl8y.com)

Notes:
  - Prompts for ADMIN_TOKEN with a hidden password read (not env).
  - Website properties are hostnames (e.g. dex.cl8y.com).
  - Telegram properties are negative chat ids (e.g. -1001234567890).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --list)
      LIST_ONLY=1
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      if [[ -z "$PROPERTY" ]]; then
        PROPERTY="$1"
      elif [[ -z "$DISPLAY_NAME" ]]; then
        DISPLAY_NAME="$1"
      else
        echo "unexpected argument: $1" >&2
        usage
        exit 2
      fi
      shift
      ;;
  esac
done

if [[ -n "${ADMIN_TOKEN:-}" ]]; then
  echo "note: ignoring ADMIN_TOKEN from environment; enter the token at the prompt" >&2
fi

if [[ ! -t 0 ]]; then
  echo "error: stdin is not a TTY; this script prompts for ADMIN_TOKEN interactively" >&2
  exit 1
fi

read -rsp "Legal ADMIN_TOKEN: " ADMIN_TOKEN_INPUT
echo >&2
if [[ -z "${ADMIN_TOKEN_INPUT}" ]]; then
  echo "error: admin token is required" >&2
  exit 1
fi

cleanup() {
  unset ADMIN_TOKEN_INPUT 2>/dev/null || true
}
trap cleanup EXIT

api_get() {
  local path="$1"
  curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer ${ADMIN_TOKEN_INPUT}" \
    -H "Accept: application/json" \
    "${API_URL}${path}"
}

api_post_json() {
  local path="$1"
  local body="$2"
  curl -sS -w '\n%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${ADMIN_TOKEN_INPUT}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    "${API_URL}${path}"
}

split_body_status() {
  local raw="$1"
  BODY="${raw%$'\n'*}"
  STATUS="${raw##*$'\n'}"
}

if [[ "$LIST_ONLY" -eq 1 ]]; then
  raw="$(api_get /admin/properties)"
  split_body_status "$raw"
  if [[ "$STATUS" != "200" ]]; then
    echo "error: list failed (HTTP ${STATUS})" >&2
    echo "$BODY" >&2
    exit 1
  fi
  echo "$BODY"
  exit 0
fi

if [[ -z "$PROPERTY" ]]; then
  read -rp "Property (hostname or telegram chat_id): " PROPERTY
fi
if [[ -z "$PROPERTY" ]]; then
  echo "error: property is required" >&2
  usage
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  if [[ -n "$DISPLAY_NAME" ]]; then
    BODY_JSON="$(jq -n --arg p "$PROPERTY" --arg d "$DISPLAY_NAME" '{property:$p, display_name:$d}')"
  else
    BODY_JSON="$(jq -n --arg p "$PROPERTY" '{property:$p}')"
  fi
else
  # Minimal JSON escape for quotes/backslashes.
  json_escape() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    printf '%s' "$s"
  }
  if [[ -n "$DISPLAY_NAME" ]]; then
    BODY_JSON="$(printf '{"property":"%s","display_name":"%s"}' "$(json_escape "$PROPERTY")" "$(json_escape "$DISPLAY_NAME")")"
  else
    BODY_JSON="$(printf '{"property":"%s"}' "$(json_escape "$PROPERTY")")"
  fi
fi

raw="$(api_post_json /admin/properties "$BODY_JSON")"
split_body_status "$raw"
if [[ "$STATUS" != "200" ]]; then
  echo "error: register failed (HTTP ${STATUS})" >&2
  echo "$BODY" >&2
  if [[ "$STATUS" == "404" || "$STATUS" == "405" ]]; then
    echo "hint: POST /admin/properties may not be deployed on this API yet; deploy cl8y-ecosystem-legal with admin register support." >&2
  fi
  exit 1
fi

echo "$BODY"
echo "registered/updated property ok" >&2
