#!/usr/bin/env bash
# Trigger a terms sync from GitLab (public endpoint, 1 req/sec per IP).
set -euo pipefail
API_URL="${API_URL:-https://api.terms.cl8y.com}"
curl -sS -X POST "${API_URL}/update_terms"
echo
