---
name: testing-coverage
description: >-
  EVM, Terra Classic, and web portal test coverage invariants for CL8Y Legal
  (GitLab issue #4). Use when adding or changing unit/integration/e2e tests,
  Playwright config, CI test jobs, or global-setup terms sync. Out of scope:
  new Telegram/Solana e2e, bot tests, OpenAPI.
---

# Testing coverage (EVM, Terra Classic, portal)

**Issue:** GitLab [#4](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/4) — Testing: EVM, Terra Classic, and web portal coverage (no Telegram/Solana)

Bundles unit, integration, Playwright e2e, and CI wiring that prove issues **#1** (Terra ADR-036), **#2** (portal terms disclosure), and **#3** (security ops) stay correct. Do not merge tests that pass only because mocks diverge from production wallet/API behavior.

## Scope

| In scope | Out of scope |
|----------|--------------|
| EVM wallet verify / submit / status | New Telegram e2e or WebApp HMAC fixes |
| Terra Classic ADR-036 verify / submit / status | New Solana e2e or envelope-alignment work |
| Portal pages (`/`, `/sign/evm`, `/sign/terra-classic`) | Bot `cargo test` / enforcement e2e |
| Shared `web/src/{ui,query,redirect,signShell}.ts` | OpenAPI generation |
| API `POST /update_terms` auth, admin Bearer | Real Keplr / MetaMask extensions in CI |
| `ADMIN_TOKEN` fail-fast (`config.rs`) | Firefox / WebKit Playwright matrix |
| `redirect_uri` allowlist (portal + SDK) | Coverage reporting / codecov |
| Rate-limit `client_ip` / XFF trust (`rate_limit.rs`) | |

## Cross-links

| Topic | Path |
|-------|------|
| Terra ADR-036 invariants | [`skills/terra-classic-adr036/SKILL.md`](../terra-classic-adr036/SKILL.md) |
| Security ops (auth, XFF, redirect) | [`skills/security-ops/SKILL.md`](../security-ops/SKILL.md) |
| Portal terms disclosure | [`skills/portal-sign-disclosure/SKILL.md`](../portal-sign-disclosure/SKILL.md) |
| Gap analysis § Testing | [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md) |
| Run commands | [`README.md`](../../README.md#tests) |
| CI jobs | [`.gitlab-ci.yml`](../../.gitlab-ci.yml) |
| Playwright config | [`web/playwright.config.ts`](../../web/playwright.config.ts) |
| E2E global setup (auth sync) | [`web/e2e/global-setup.ts`](../../web/e2e/global-setup.ts) |

### Key test artifacts

| Layer | Files |
|-------|-------|
| API unit | `api/src/verify/{evm,terra}.rs`, `api/src/auth.rs`, `api/src/rate_limit.rs`, `api/src/message.rs`, `api/src/account.rs`, `api/src/config.rs` |
| API integration | `api/tests/integration_test.rs` |
| Web unit | `web/src/signShell.test.ts`, `web/src/ui.test.ts`, `web/src/redirect.test.ts`, `web/src/query.test.ts` |
| SDK unit | `packages/cl8y-clickwrap/src/redirect.test.ts`, `packages/cl8y-clickwrap/src/message.test.ts`, `packages/cl8y-clickwrap/src/client.test.ts` |
| E2E | `web/e2e/{home,sign-pages,evm-sign,terra-sign,redirect}.spec.ts`, `web/e2e/helpers/{evm-wallet,keplr-wallet,sign-flow}.ts` |
| E2E (leave as-is) | `web/e2e/telegram-config.spec.ts` |

## What each layer proves

### Unit

Proves **pure logic** in isolation — no Postgres, no browser, no live GitLab fetch.

| Area | Proves | Key files |
|------|--------|-----------|
| EVM crypto | `personal_sign` roundtrip; wrong-message / wrong-account reject | `api/src/verify/evm.rs` |
| Terra ADR-036 | CosmJS/Keplr vectors, high-S normalize, raw-byte reject, escape roundtrip | `api/src/verify/terra.rs` |
| Admin auth | Bearer parse, constant-time compare, `require_admin` 401 paths | `api/src/auth.rs` |
| XFF / rate limit | Peer IP default; rightmost XFF when trusted; spoof ignored without trust; `/update_terms` 1 req/s | `api/src/rate_limit.rs` |
| Token boot | `ADMIN_TOKEN` fail-fast unless `ALLOW_INSECURE_DEFAULTS` | `api/src/config.rs` |
| Message / account | Canonical message build, timestamp skew rules, Terra bech32 normalize | `api/src/message.rs`, `api/src/account.rs` |
| Sign shell | Terms text-only render, consent gate, load error | `web/src/signShell.test.ts` |
| Redirect allowlist | Env wiring, evil scheme/origin block | `web/src/redirect.test.ts`, `web/src/ui.test.ts`, `packages/cl8y-clickwrap/src/redirect.test.ts` |

### Integration (API + Postgres)

Proves **HTTP routes + DB** with real Axum stack and fixture keys.

| Flow | Proves | Test name |
|------|--------|-----------|
| EVM multi-property | submit → status, property scoping | `integration_property_scoped_signatures` |
| EVM abuse | cross-property replay + wrong-account bind | `integration_evm_rejects_cross_property_replay` |
| Terra ADR-036 happy path | wallet submit → `signed_latest` | `integration_terra_classic_adr036_wallet_submit` |
| Terra abuse | cross-property replay, tampered message, wrong pubkey, timestamp skew | `integration_terra_classic_adr036_rejects_abuse` |
| Admin / sync auth | unauth + bad Bearer → 401 on `/update_terms` and `/admin/*`; valid Bearer → 200; `/health` public | `integration_update_terms_requires_admin_bearer` |
| Oversized body | wallet POST > 64 KiB → 413 | `integration_wallet_rejects_oversized_body` |

Requires `DATABASE_URL` (Postgres). Tests skip gracefully if DB unavailable.

### E2E (Playwright + API + Vite)

Proves **full stack** — portal UI, mock wallets, authenticated terms publish, status API.

| Spec | Proves |
|------|--------|
| `home.spec.ts` | Home loads; links to sign routes |
| `sign-pages.spec.ts` | Missing `property` guard; EVM + Terra terms disclosure + consent gate |
| `evm-sign.spec.ts` | Mock Ethereum wallet → accept → `signed_latest` |
| `terra-sign.spec.ts` | Mock Keplr `signArbitrary` ADR-036 → accept → `signed_latest` |
| `redirect.spec.ts` | Allowlisted `redirect_uri` navigates; evil URI shows success without navigation |
| `telegram-config.spec.ts` | “Not configured” smoke only — **do not expand** for #4 |

E2E uses **Chromium only**, `workers: 5`, mock `window.ethereum` / `window.keplr` (no real extensions). `global-setup.ts` publishes terms via **Bearer** `POST /update_terms`.

## Invariants (do not break)

1. **No unauthenticated `/update_terms` in e2e or scripts** — `global-setup.ts` and CI must send `Authorization: Bearer <ADMIN_TOKEN>`. Readiness uses `GET /health`, not sync.
2. **Terra tests exercise ADR-036** — never raw-message ECDSA verify; mocks must call `signArbitrary(chainId, signer, data)` (see `terra-classic-adr036` skill).
3. **Fixture keys only** — test private keys in `integration_test.rs`, `evm-wallet.ts`, `keplr-wallet.ts`; never production `ADMIN_TOKEN` or bot tokens.
4. **Playwright `workers: 5`** — keep `web/playwright.config.ts` at 5 unless CI flake data justifies change.
5. **Chromium only in CI** — `.gitlab-ci.yml` `test:e2e` installs Chromium; do not add browsers without issue.
6. **Mock wallets in e2e** — `installEvmWallet` / `installKeplrWallet`; no mandatory real-extension job.
7. **Consent before sign** — e2e full-sign specs use `acceptViaConsent` (checkbox + Connect & sign); aligns with `portal-sign-disclosure`.
8. **Redirect hardening** — evil `redirect_uri` must not navigate; success UI still shown. Portal + SDK share allowlist semantics.
9. **XFF untrusted in e2e** — `TRUSTED_PROXY_CIDRS: ""` in Playwright API env; spoofed XFF must not split rate buckets (unit-tested).
10. **Canonical message golden** — Rust + SDK message tests stay aligned when changing `buildWalletMessage` (must include `Content-SHA256`; see GitLab #6 / `security-ops`).
11. **Do not require Telegram/Solana e2e** for closing #4 — leave `telegram-config.spec.ts` minimal; Solana verify mismatch remains a separate P0.
12. **MR pipelines run full test matrix** — `.gitlab-ci.yml` `workflow:rules` ensures `test:rust`, `test:web`, `test:e2e` on MRs (not gitleaks-only).

## Agent checklist

When adding or changing tests for this issue:

- [ ] In-scope path has coverage at the right layer (unit vs integration vs e2e) — see table above
- [ ] Terra: CosmJS vector + integration submit + mock Keplr e2e still green
- [ ] EVM: integration + `evm-sign.spec.ts` still green
- [ ] Terms disclosure: `signShell.test.ts` + `sign-pages.spec.ts` (EVM + Terra) still green
- [ ] Security: `integration_update_terms_requires_admin_bearer` + `rate_limit.rs` XFF tests still green
- [ ] Redirect: `redirect.test.ts`, `ui.test.ts`, SDK `redirect.test.ts`, `redirect.spec.ts` still green
- [ ] `global-setup.ts` still uses Bearer; `ADMIN_TOKEN` matches Playwright API env
- [ ] No new dependency on unauthenticated sync or default `dev-admin-token` in CI
- [ ] Update this skill + `gaps/GAP_1786322222.md` §5 if coverage map changes
- [ ] MR description maps acceptance criteria → test artifacts (table below)

## Quick verify

```bash
# API (Postgres required for integration)
cd api && cargo fmt --check && cargo clippy --all-targets -- -D warnings
cd api && cargo test

# Web + SDK unit (root workspaces)
npm ci && npm run test:sdk && npm run test:web

# Full e2e (Postgres + Chromium)
cd web && npm run test:e2e

# Targeted e2e subsets
cd web && npm run test:e2e -- evm-sign terra-sign redirect sign-pages
```

CI mirrors: `test:rust`, `test:clickwrap`, `test:web`, `test:e2e` in [`.gitlab-ci.yml`](../../.gitlab-ci.yml).

## Acceptance criteria → test artifacts

Maps GitLab #4 acceptance criteria to concrete tests (close #4 when all rows are green in CI).

| #4 criterion | Primary artifacts |
|--------------|-------------------|
| ADR-036 Terra unit + integration submit → status | `api/src/verify/terra.rs` tests; `integration_terra_classic_adr036_wallet_submit` |
| `/update_terms` auth + XFF/trust once #3 lands | `integration_update_terms_requires_admin_bearer`; `api/src/rate_limit.rs` `xff_*` / `spoofed_xff_*` tests |
| Portal terms disclosure EVM + Terra (#2) | `web/src/signShell.test.ts`; `web/e2e/sign-pages.spec.ts` |
| EVM Playwright full sign green | `web/e2e/evm-sign.spec.ts` |
| Terra Classic Playwright path (prefer full e2e) | `web/e2e/terra-sign.spec.ts` + `web/e2e/helpers/keplr-wallet.ts` |
| Redirect allowlist automated | `web/src/redirect.test.ts`, `web/src/ui.test.ts`, `packages/cl8y-clickwrap/src/redirect.test.ts`, `web/e2e/redirect.spec.ts` |
| CI updated; no unauth `/update_terms` | `.gitlab-ci.yml` `ADMIN_TOKEN`; `web/e2e/global-setup.ts` Bearer; `web/playwright.config.ts` |
| No new Telegram/Solana test debt | Explicit non-goals; `telegram-config.spec.ts` unchanged scope |

### Abuse / attack vectors (issue #4 test plan)

| Vector | Layer | Artifact | Expectation |
|--------|-------|----------|-------------|
| Unauth `POST /update_terms` | Integration | `integration_update_terms_requires_admin_bearer` | 401 |
| Invalid admin Bearer | Integration + unit | `integration_update_terms_requires_admin_bearer`, `auth.rs` | 401 |
| XFF spoof without trust | Unit | `rate_limit.rs` `xff_ignored_*`, `spoofed_xff_*` | Peer IP used |
| Cross-property replay | Integration | `integration_terra_classic_adr036_rejects_abuse`, `integration_evm_rejects_cross_property_replay` | 4xx |
| Terra sig wrong ADR-036 payload | Unit + integration | `verify/terra.rs`, abuse integration | Reject |
| EVM sig wrong account/message | Unit + integration | `verify/evm.rs`, `integration_evm_rejects_cross_property_replay` | Reject |
| XSS in terms / query | Unit + e2e | `signShell.test.ts`, `sign-pages.spec.ts` | Text-only render |
| Evil `redirect_uri` | Unit + e2e | `redirect.test.ts`, `redirect.spec.ts` | No navigation |
| Oversized wallet POST | Integration | `integration_wallet_rejects_oversized_body` (`MAX_REQUEST_BODY_BYTES`) | 413 |

## Coverage narrative (for MRs)

**Proven in CI today:** EVM and Terra Classic wallet paths from crypto verify through DB status; portal terms disclosure and consent on EVM/Terra sign pages; admin Bearer on `/update_terms` and `/admin/*`; redirect allowlist; XFF trust policy; authenticated e2e global-setup.

**Explicit non-goals (#4):** Telegram WebApp HMAC, Solana envelope alignment, bot enforcement tests, OpenAPI, real-wallet extension smoke, multi-browser matrix.
