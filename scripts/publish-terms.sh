#!/usr/bin/env bash
# Trigger an authenticated terms sync from GitLab (POST /update_terms).
set -euo pipefail
API_URL="${API_URL:-https://api.terms.cl8y.com}"
if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "ADMIN_TOKEN is required (Bearer for POST /update_terms)" >&2
  exit 1
fi
curl -sS -X POST "${API_URL}/update_terms" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
echo
