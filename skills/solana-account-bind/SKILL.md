---
name: solana-account-bind
description: >-
  Solana `/sign/solana` integrator account= continuity (GitLab #17). Use when
  changing the Solana sign page, claimed-account helper, base58 decode, or
  Solana Playwright mocks. Do not treat this as envelope alignment or #2 terms
  disclosure.
---

# Solana portal `account=` bind

**Issue:** GitLab [#17](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/17)  
**Same contract as:** Terra [#11](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/11), EVM [#15](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/15) / [#16](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/16)

SDK `TermsGate` / `buildSignUrl({ account })` (0.1.1+) puts `account=` on **every** network sign URL, including `sign_urls.solana`. The portal must refuse a connected wallet whose pubkey is not that 32-byte key.

## When to use

- Editing [`web/src/pages/solana.ts`](../../web/src/pages/solana.ts) or [`web/src/solana/`](../../web/src/solana/)
- Changing [`web/src/base58.ts`](../../web/src/base58.ts) decode (must stay lockstep with API `bs58`)
- Adding Solana Playwright coverage for **bind only**

## Invariants (do not break)

1. **Case-sensitive.** Do **not** `toLowerCase()` Solana addresses. Canonicalize: trim → bs58 decode → exactly 32 bytes. Compare **decoded bytes**.
2. **`account` is not a URL.** Never pass it to `location`, `<a href>`, or success redirect. *Sign as …* is a text node (`el()` / `textContent`). No `innerHTML`.
3. **Portal bind is UX.** API still verifies submitted `account_id` + signature. Do not trust query `account` on `POST /api/v1/signatures/wallet`.
4. **Do not “fix” the off-chain envelope** here. Portal still `signMessage(utf8)`; API still verifies `0xff || "solana offchain" || LE u64 len || msg`. Matching e2e must **not** require `signed_latest` until that P0 is an explicit, dual-scoped change. See [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md).
5. **No EVM/Terra chrome** on `/sign/solana`. `window.solana` only — no Phantom deeplinks / wallet-adapter matrix in this issue.
6. **No drive-by `#2` terms disclosure.** Do not mount `renderSignShell` unless that issue is in scope. Consent checkbox is not Solana authentication.
7. **Already-signed:** after connect + bind, if `getStatus(property, "SOLANA", bound)` is `signed_latest`, show success without `signMessage`. Fetch status only **after** connect.
8. **Message bytes** stay `buildWalletMessage` / `Content-SHA256` lockstep ([#6](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/6), [`security-ops`](../security-ops/SKILL.md)).
9. **Invalid / hostile `account`** (`javascript:`, `data:`, `0x…`, `terra1…`, short garbage) → fail closed with *This page is for a different wallet. Reconnect that account and try again.* Button re-enables. No submit.
10. **No `account` query** → sign whatever valid pubkey `window.solana` returns; API binds that `account_id`.
11. **Playwright:** Chromium, `workers = 5`, mock `window.solana` only.

## Files

| Layer | Path |
|-------|------|
| Bind helper | [`web/src/solana/account.ts`](../../web/src/solana/account.ts) |
| Page | [`web/src/pages/solana.ts`](../../web/src/pages/solana.ts) |
| Query | [`web/src/query.ts`](../../web/src/query.ts) `getClaimedAccount` |
| Decode | [`web/src/base58.ts`](../../web/src/base58.ts) `base58ToUint8` |
| API normalize (do not lowercase) | [`api/src/account.rs`](../../api/src/account.rs) `SOLANA` |
| API verify (do not weaken) | [`api/src/verify/solana.rs`](../../api/src/verify/solana.rs) |
| SDK already passes `account` | [`packages/cl8y-clickwrap/src/urls.ts`](../../packages/cl8y-clickwrap/src/urls.ts), [`TermsGate.tsx`](../../packages/cl8y-clickwrap/src/react/TermsGate.tsx) |
| Unit | [`web/src/solana/account.test.ts`](../../web/src/solana/account.test.ts), [`web/src/base58.test.ts`](../../web/src/base58.test.ts), [`web/src/query.test.ts`](../../web/src/query.test.ts) |
| E2E | [`web/e2e/solana-sign.spec.ts`](../../web/e2e/solana-sign.spec.ts), [`web/e2e/helpers/solana-wallet.ts`](../../web/e2e/helpers/solana-wallet.ts) |

Related: [`portal-sign-disclosure`](../portal-sign-disclosure/SKILL.md) (EVM/Terra shell — Solana disclosure still postponed), [`testing-coverage`](../testing-coverage/SKILL.md), root [`README.md`](../../README.md).

## Verify

```bash
cd web && npx vitest run src/solana src/query.test.ts src/base58.test.ts
cd web && npx playwright test --workers=5 e2e/solana-sign.spec.ts e2e/sign-pages.spec.ts
```
