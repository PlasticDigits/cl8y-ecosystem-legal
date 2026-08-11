---
name: security-ops
description: >-
  Operate and extend CL8Y Legal portal/API security controls for admin auth,
  authenticated terms sync, redirect_uri allowlisting, and trusted-proxy XFF.
  Use when changing /update_terms, ADMIN_TOKEN, rate-limit IP logic, or sign
  redirect handling; or when writing e2e/CI that triggers terms sync.
---

# Security ops (portal + API)

Cross-links: GitLab issue **#3**, gap items **4–7** in [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md), env templates [`.env.example`](../../.env.example) / [`web/.env.example`](../../web/.env.example), root [`README.md`](../../README.md). Tests: [`skills/testing-coverage/SKILL.md`](../testing-coverage/SKILL.md).

## Invariants (do not regress)

1. **`POST /update_terms` is authenticated.** Requires `Authorization: Bearer <ADMIN_TOKEN>`. Unauthenticated → **401**. No public GET sync trigger. Auth runs **before** the 1 req/s ops rate limit (unauth floods must not exhaust the admin bucket).
2. **Unattended sync is startup + interval worker**, not the HTTP route (`TERMS_SYNC_ON_STARTUP`, `TERMS_SYNC_INTERVAL_HOURS`).
3. **One Bearer scheme.** Reuse `ADMIN_TOKEN` for `/admin/*` and `/update_terms`. Do not invent a second ad-hoc token without docs + issue update.
4. **`ADMIN_TOKEN` fail-fast.** Missing/empty/known-default `dev-admin-token` refuses boot unless `ALLOW_INSECURE_DEFAULTS=true` (local/dev only; never silent default in prod).
5. **Constant-time Bearer compare** via `api/src/auth.rs` (`subtle`). Keep admin checks there.
6. **`redirect_uri` allowlist on the portal.** `web/src/ui.ts` → `safeRedirectUri` / SDK `sanitizeRedirectUri`. Reject `javascript:`, `data:`, protocol-relative, userinfo; HTTPS-only except loopback when `VITE_ALLOW_LOCALHOST_REDIRECT` is on. Invalid URI → show success, **no** navigation.
7. **XFF untrusted by default.** `client_ip` uses TCP peer unless peer ∈ `TRUSTED_PROXY_CIDRS`; then use **rightmost** valid XFF hop. Documented in `api/src/rate_limit.rs`.
8. **`GET /health`** is public liveness only (no sync, no secrets).

## Key files

| Concern | Path |
|---------|------|
| Bearer helpers | `api/src/auth.rs` |
| Token / proxy config | `api/src/config.rs` |
| Rate limit + XFF | `api/src/rate_limit.rs` |
| Update terms route | `api/src/routes/update_terms.rs` |
| Admin routes | `api/src/routes/admin.rs` |
| Health | `api/src/routes/health.rs` |
| Portal sanitize | `web/src/redirect.ts`, `web/src/ui.ts` |
| SDK helpers | `packages/cl8y-clickwrap/src/redirect.ts` |
| E2E sync | `web/e2e/global-setup.ts` (sends Bearer) |
| Ops curl helper | `scripts/publish-terms.sh` |

## Agent checklist

- [ ] CI/e2e sets explicit `ADMIN_TOKEN` (see `.gitlab-ci.yml` / `web/playwright.config.ts`).
- [ ] Any new call to `/update_terms` sends Bearer; readiness probes use `/health`, not `/update_terms`.
- [ ] New redirect consumers use `sanitizeRedirectUri` / portal env allowlist.
- [ ] Changing XFF policy updates this skill + `.env.example` hop description together.
- [ ] Production deploy docs never recommend `ALLOW_INSECURE_DEFAULTS=true`.

## Out of scope here

Telegram/Solana/Terra crypto fixes, bot kick semantics (see [`skills/bot-enforcement/SKILL.md`](../bot-enforcement/SKILL.md) / GitLab #5), property auto-upsert allowlisting (see other issues / gap P0–P1 items).
