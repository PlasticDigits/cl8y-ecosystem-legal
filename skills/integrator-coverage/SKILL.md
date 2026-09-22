---
name: integrator-coverage
description: >-
  TermsGate coverage matrix for first-party CL8Y hosts: which origins are
  wallet-gated integrators vs documented marketing exceptions. Use when
  registering properties, editing CORS_ORIGINS, VITE_REDIRECT_URI_ALLOWLIST,
  README API examples, or deciding whether to mount @plasticdigits/cl8y-clickwrap.
---

# Integrator coverage (first-party hosts)

Cross-links: GitLab **[#34](https://git.cl8y.com/code/cl8y-ecosystem-legal/issues/34)** (matrix + ops), **[#8](https://git.cl8y.com/code/cl8y-ecosystem-legal/issues/8)** / **[#12](https://git.cl8y.com/code/cl8y-ecosystem-legal/issues/12)** (ops playbook), SDK [`packages/cl8y-clickwrap`](../../packages/cl8y-clickwrap), [`skills/security-ops`](../security-ops/SKILL.md) (redirect allowlist + CORS), root [`README.md`](../../README.md).

Acceptance is **per property** (hostname). One signature row per `(property, terms version, network, account)`. Signing on one host does **not** satisfy another.

## Coverage matrix

| Host | TermsGate / status API | Legal `property` | Ops (CORS + portal allowlist) | Notes |
|------|------------------------|------------------|-------------------------------|-------|
| `https://dex.cl8y.com` | **Yes** — wallet-connected mutative SPA | `dex.cl8y.com` | Registered; origin on `CORS_ORIGINS` and `VITE_REDIRECT_URI_ALLOWLIST` | Reference: DEX `ConnectedTermsGate` ([dex#517](https://git.cl8y.com/code/cl8y-dex-terraclassic/issues/517)). |
| `https://bridge.cl8y.com` | **Yes** — wallet-connected mutative UI | `bridge.cl8y.com` | Same playbook as DEX; exact origin `https://bridge.cl8y.com` | Frontend: [bridge#134](https://git.cl8y.com/code/cl8y-bridge-monorepo/issues/134); property constant `bridge.cl8y.com` only — never derive from `window.location.hostname`. |
| `https://cl8y.com` | **No** — documented exception | n/a (not a clickwrap integrator) | Do **not** add apex to CORS for status polling; optional footer link to portal **reader** only | Marketing SPA: no `@plasticdigits/cl8y-clickwrap`, no `/api/v1/signatures/status`. See [CL8Y-web#34](https://git.cl8y.com/code/CL8Y-web/issues/34) sibling. |
| `ust1cmm.com` / `vote.cl8y.com` | Yes (existing products) | respective hostnames | See #8 / #12 | Out of scope for #34 except as playbook references. |
| `yieldomega.com` | Per product integrator | `yieldomega.com` | When that product ships wallet UI | Not part of the #34 three-row matrix. |

## Rules

1. **Wallet-connected mutative UI** → SDK `TermsGate` + dedicated `property` + API `CORS_ORIGINS` + portal `VITE_REDIRECT_URI_ALLOWLIST` (HTTPS exact origin, no `*`, no trailing slash).
2. **Informational / marketing host** → exception in this table; optional compile-time `https://terms.cl8y.com` link for **reading** T&Cs; no status polling, no synthetic account, no `localStorage` “signed” flags.
3. **Never share properties across hosts** — bridge clients must send `bridge.cl8y.com` only; DEX sends `dex.cl8y.com` only.
4. **Solana** — integrators stay fail-closed if `/sign/solana` cannot produce a verifiable signature; do not add “skip Solana legal” env flags in Legal or dapps.
5. **Do not treat T&Cs as a Privacy Notice** — marketing footer “Terms” is not `/privacy` / cookies / opt-out ([CL8Y-web#12](https://git.cl8y.com/code/CL8Y-web/issues/12)).

## Ops checklist (gated dapp)

```bash
./scripts/register-property.sh <hostname> "<Display name>"
./scripts/register-property.sh --list
```

- API: append `https://<hostname>` to `CORS_ORIGINS` (keep existing entries).
- Portal: append `https://<hostname>` to `VITE_REDIRECT_URI_ALLOWLIST` and **rebuild** the static site (Vite inlines the allowlist).
- Do not enable `VITE_ALLOW_LOCALHOST_REDIRECT` on production portal.

Verify (no secrets in logs):

```bash
curl -sS "https://api.terms.cl8y.com/api/v1/terms/latest?property=<hostname>" \
  | jq '{property, version_label, evm: .sign_urls.evm, terra: .sign_urls.terra_classic, solana: .sign_urls.solana}'

curl -sSI -X OPTIONS 'https://api.terms.cl8y.com/api/v1/signatures/status' \
  -H "Origin: https://<hostname>" \
  -H 'Access-Control-Request-Method: GET' \
  | grep -i 'access-control-allow-origin'
```

## Agent checklist

- [ ] README public API examples use a **gated** property (`dex.cl8y.com` or `bridge.cl8y.com`), not `cl8y.com` as the default integrator.
- [ ] Adding TermsGate to `cl8y.com` requires a **new** issue and matrix update — SDK needs `network` + `account`.
- [ ] New first-party wallet UI → new row in this matrix before code merge.
- [ ] Portal redirect tests in `web/e2e/redirect.spec.ts` stay green; allowlist unit tests cover production origins.

## Key files

| Concern | Path |
|---------|------|
| Property registration | `scripts/register-property.sh` |
| API CORS | `api/src/config.rs`, `.env.example` |
| Portal allowlist | `web/src/redirect.ts`, `web/.env.example` |
| SDK | `packages/cl8y-clickwrap/src/react/TermsGate.tsx` |
