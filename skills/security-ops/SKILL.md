---
name: security-ops
description: >-
  Operate and extend CL8Y Legal portal/API security controls for admin auth,
  authenticated terms sync, terms-oracle invariants (hash-aware sync, anti-downgrade,
  Content-SHA256 message binding), redirect_uri allowlisting, and trusted-proxy XFF.
  Use when changing /update_terms, ADMIN_TOKEN, terms sync policy, acceptance
  message builders, rate-limit IP logic, or sign redirect handling; or when writing
  e2e/CI that triggers terms sync.
---

# Security ops (portal + API)

Cross-links: GitLab issues **[#3](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/3)** (auth/ops) and **[#6](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/6)** (terms oracle), gap items in [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md), env templates [`.env.example`](../../.env.example) / [`web/.env.example`](../../web/.env.example), root [`README.md`](../../README.md). Tests: [`skills/testing-coverage/SKILL.md`](../testing-coverage/SKILL.md). Audit context: [`audits/INTERNAL_COMPOSER_1786408744.md`](../../audits/INTERNAL_COMPOSER_1786408744.md) (H4).

## Invariants (do not regress)

1. **`POST /update_terms` is authenticated.** Requires `Authorization: Bearer <ADMIN_TOKEN>`. Unauthenticated → **401**. No public GET sync trigger. Auth runs **before** the 1 req/s ops rate limit (unauth floods must not exhaust the admin bucket).
2. **Unattended sync is startup + interval worker**, not the HTTP route (`TERMS_SYNC_ON_STARTUP`, `TERMS_SYNC_INTERVAL_HOURS`).
3. **One Bearer scheme.** Reuse `ADMIN_TOKEN` for `/admin/*` and `/update_terms`. Do not invent a second ad-hoc token without docs + issue update. Ops scripts that hit admin routes (`scripts/register-property.sh`) must prompt for the token interactively (hidden password) and must **not** read `ADMIN_TOKEN` from the environment.
4. **`ADMIN_TOKEN` fail-fast.** Missing/empty/known-default `dev-admin-token` refuses boot unless `ALLOW_INSECURE_DEFAULTS=true` (local/dev only; never silent default in prod).
5. **Constant-time Bearer compare** via `api/src/auth.rs` (`subtle`). Keep admin checks there.
6. **`redirect_uri` allowlist on the portal.** `web/src/ui.ts` → `safeRedirectUri` / SDK `sanitizeRedirectUri`. Reject `javascript:`, `data:`, protocol-relative, userinfo; HTTPS-only except loopback when `VITE_ALLOW_LOCALHOST_REDIRECT` is on. Invalid URI → show success, **no** navigation.
7. **XFF untrusted by default.** `client_ip` uses TCP peer unless peer ∈ `TRUSTED_PROXY_CIDRS`; then use **rightmost** valid XFF hop. Documented in `api/src/rate_limit.rs`.
8. **`GET /health`** is public liveness only (no sync, no secrets).

### Terms oracle (GitLab #6)

9. **Hash-aware sync.** `sync_terms_from_url` / `sync_terms_content` (`api/src/terms/sync.rs`) compare `content_sha256` **and** `Version:` label. Label-alone equality must never skip a body change.
10. **Same label + different body → reject.** Do **not** auto-suffix labels or silently keep stale DB text. Operators must bump line-2 `Version:` when editing [`TERMS_AND_CONDITIONS.txt`](../../TERMS_AND_CONDITIONS.txt). Prefer fail-closed errors over “unchanged”.
11. **Anti-downgrade.** Refuse to set `is_latest` on a previously published label unless `FORCE_TERMS_DOWNGRADE=true` (logged; local/ops only). Force reactivates the existing row (hash must still match); it does not mutate historical bytes or delete rows.
12. **Acceptance message binds `Content-SHA256`.** Rust (`api/src/message.rs`), SDK (`packages/cl8y-clickwrap/src/message.ts`), and portal sign pages must stay byte-identical. Changing the format is a **breaking** coordinated release (API + SDK + web) — bump terms `Version:` so clients re-sign.
13. **Empty/unparseable remote fails closed** — never clear `is_latest` on fetch/parse failure. Oversized bodies are rejected (`MAX_TERMS_BYTES`).
14. **No orphan sync modules.** Live path is `api/src/terms/sync.rs` only (do not reintroduce a duplicate `terms_sync.rs`).

## Key files

| Concern | Path |
|---------|------|
| Bearer helpers | `api/src/auth.rs` |
| Token / proxy / force-downgrade config | `api/src/config.rs` |
| Rate limit + XFF | `api/src/rate_limit.rs` |
| Update terms route | `api/src/routes/update_terms.rs` |
| Terms oracle sync | `api/src/terms/sync.rs` (`plan_terms_sync`, `sync_terms_content`) |
| Publish / reactivate | `api/src/terms.rs` |
| Canonical acceptance message | `api/src/message.rs`, `packages/cl8y-clickwrap/src/message.ts` |
| Portal message builders | `web/src/pages/evm.ts`, `terra.ts`, `solana.ts` |
| Admin routes | `api/src/routes/admin.rs` (`GET/POST /admin/properties`, `DELETE …/{kind}/{identifier}`) |
| Health | `api/src/routes/health.rs` |
| Portal sanitize | `web/src/redirect.ts`, `web/src/ui.ts` |
| SDK helpers | `packages/cl8y-clickwrap/src/redirect.ts` |
| E2E sync | `web/e2e/global-setup.ts` (sends Bearer) |
| Ops curl helpers | `scripts/publish-terms.sh`, `scripts/register-property.sh` (interactive hidden token; ignores `ADMIN_TOKEN` env) |

## Agent checklist

- [ ] CI/e2e sets explicit `ADMIN_TOKEN` (see `.gitlab-ci.yml` / `web/playwright.config.ts`).
- [ ] Any new call to `/update_terms` sends Bearer; readiness probes use `/health`, not `/update_terms`.
- [ ] New redirect consumers use `sanitizeRedirectUri` / portal env allowlist.
- [ ] Changing XFF policy updates this skill + `.env.example` hop description together.
- [ ] Production deploy docs never recommend `ALLOW_INSECURE_DEFAULTS=true` or `FORCE_TERMS_DOWNGRADE=true`.
- [ ] Changing sync policy or message format updates Rust + SDK golden tests, this skill, and README together.
- [ ] Portal/SDK `buildWalletMessage` / `buildAcceptanceMessage` always pass `contentSha256` from `terms.content_sha256`.

## Out of scope here

Telegram/Solana/Terra crypto fixes, bot kick semantics (see [`skills/bot-enforcement/SKILL.md`](../bot-enforcement/SKILL.md) / GitLab #5), property auto-upsert allowlisting, SSRF hardening of the terms fetch client (see other issues / gap P0–P1 items).
