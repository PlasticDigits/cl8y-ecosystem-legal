---
name: terra-classic-adr036
description: >-
  Terra Classic (TERRA_CLASSIC) Keplr signArbitrary + API ADR-036 verification
  invariants for CL8Y Legal, including GitLab #9 mobile Chrome Open-in-Keplr
  fallback. Use when changing portal Terra signing, Keplr Mobile deeplinks,
  API verify/terra.rs, account normalization, wallet submit, CI rules affecting
  test:rust/test:e2e, or columbus-5 Keplr mocks.
---

# Terra Classic / Keplr ADR-036

## Scope

- **In scope:** Web portal `/sign/terra-classic` + API `TERRA_CLASSIC` wallet verify + mobile Open-in-Keplr CTA (GitLab [#9](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/9)).
- **Out of scope:** Telegram, Solana, WalletConnect / in-Chrome `signArbitrary`, Terra 2.0 (`phoenix-1`).

Cross-links:

- Issue: GitLab `#1` (Fix Terra Classic / Keplr ADR-036) — MR `!5`
- Issue: GitLab `#9` (mobile Chrome `window.keplr` missing) — portal fallback, not DEX/bridge connect
- Portal: [`web/src/pages/terra.ts`](../../web/src/pages/terra.ts)
- Mobile fallback: [`web/src/keplrMobile.ts`](../../web/src/keplrMobile.ts), [`web/src/keplrMobileUi.ts`](../../web/src/keplrMobileUi.ts)
- API verify: [`api/src/verify/terra.rs`](../../api/src/verify/terra.rs)
- Account normalize: [`api/src/account.rs`](../../api/src/account.rs)
- Wallet submit + message bind: [`api/src/signatures.rs`](../../api/src/signatures.rs), [`api/src/message.rs`](../../api/src/message.rs)
- Body limit: [`api/src/routes/mod.rs`](../../api/src/routes/mod.rs) (`DefaultBodyLimit` 64 KiB)
- E2E mock: [`web/e2e/helpers/keplr-wallet.ts`](../../web/e2e/helpers/keplr-wallet.ts), [`web/e2e/terra-sign.spec.ts`](../../web/e2e/terra-sign.spec.ts)
- Integration: [`api/tests/integration_test.rs`](../../api/tests/integration_test.rs) (`integration_terra_classic_adr036_*`)
- Gap note: [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md) (Terra portal finding resolved; mock e2e + missing-Keplr CTA)
- Integrator overview: [`README.md`](../../README.md#terra-classic-keplr)
- CI workflow: [`.gitlab-ci.yml`](../../.gitlab-ci.yml) (MR pipelines must run `test:rust` + `test:e2e`)
- Tests map (EVM/Terra/portal layers): [`skills/testing-coverage/SKILL.md`](../testing-coverage/SKILL.md)
- Keplr Mobile deeplink docs: https://docs.keplr.app/api/mobile/deeplink

## Invariants (do not break)

1. **Chain id for Keplr enable / getKey / signArbitrary** is `columbus-5` (Terra Classic). Do not silently switch to Terra 2.0.
2. **Frontend API:** call `window.keplr.signArbitrary(chainId, signerAddress, data)` — never `getOfflineSigner(...).signArbitrary(address, data)`.
3. **Address canonicalize:** portal lowercases Keplr `bech32Address` (reject mixed case) before `buildWalletMessage` / `signArbitrary` / submit — matches API `normalize_account` re-encode.
4. **Signed payload:** Keplr wraps the canonical CL8Y acceptance UTF-8 string as ADR-036 amino `sign/MsgSignData`. The **legal message text** stays the shared canonical builder (`api/src/message.rs` / SDK `message.ts`); only the crypto envelope is ADR-036.
5. **ADR-036 amino document** (what is SHA-256 hashed before secp256k1 verify) always has:
   - `chain_id: ""`, `memo: ""`
   - `account_number: "0"`, `sequence: "0"`
   - `fee: { gas: "0", amount: [] }`
   - `msgs: [{ type: "sign/MsgSignData", value: { signer, data: base64(message) } }]`
   - CosmJS `serializeSignDoc` key order + `&`/`<`/`>` escapes
6. **API verify** must hash that serialized doc (via `k256` `Verifier`, which SHA-256s the bytes), not raw `message.as_bytes()`.
7. **Pubkey binding:** compressed secp256k1 pubkey (33 bytes, base64) must derive `terra1…` bech32 (HRP `terra`, 20-byte ripemd160(sha256(pubkey))).
8. **Address validation:** full bech32 checksum — not `starts_with("terra")`. Mixed-case rejected by decode; uppercase normalized to lowercase.
9. **No legacy raw-ECDSA accept path** — old wrong verify never worked against Keplr; do not dual-verify.
10. **Submit fields:** `POST /api/v1/signatures/wallet` with `network: "TERRA_CLASSIC"`, `signature` + `pubkey` base64 (Keplr `pub_key.value`).
11. **Low-S ECDSA:** verifiers normalize compact signatures to low-S (Keplr/CosmJS convention). E2E mocks must not emit high-S; unit tests may prove high-S still verifies after normalize.
12. **Message binding:** `submit_wallet` rebuilds canonical message (property, network, account, terms, timestamp) and rejects mismatches — blocks cross-property / cross-account replay.
13. **Request size:** HTTP bodies capped at 64 KiB (`DefaultBodyLimit`) — wallet JSON must stay within this budget.
14. **CI:** changes to this path must keep `lint:rust`, `test:rust`, and `test:e2e` green on **merge request** pipelines (see `.gitlab-ci.yml` `workflow:rules`).
15. **Missing `window.keplr` is not a dead end (GitLab #9):** never throw `Keplr extension not found` as the only UI. Show **Open in Keplr** (documented universal `https://deeplink.keplr.app/web-browser?url=`) plus **Copy link**. Idle copy is retail-short (no “ADR-036”). Do not tell Android Chrome users to install the desktop extension.
16. **Deep-link target is the current portal sign URL** (`origin + pathname + search`). Never encode `redirect_uri` or any other query-supplied URL into the Keplr `url` param (open-redirect). Fail closed on non-http(s) schemes and origin mismatch.
17. **Copy-link copies the portal sign URL**, not `deeplink.keplr.app`. After Open in Keplr, signing still uses invariant 2 (`signArbitrary`) inside the in-app browser.
18. **EVM / Solana / Telegram sign pages stay unchanged.** Terra may pass `extraControls` into `renderSignShell`; other networks must not mount the Keplr fallback.

## Agent checklist

When editing this path:

- [ ] Unit tests in `api/src/verify/terra.rs` still include a CosmJS/Keplr vector and reject raw-byte signatures
- [ ] `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings` green in `api/` (and `bot/` if touched)
- [ ] `cargo test` (lib + integration with Postgres) green for Terra happy + abuse tests
- [ ] Playwright Terra mock (`web/e2e/terra-sign.spec.ts`) still uses `signArbitrary(chainId, signer, data)`
- [ ] Playwright missing-Keplr case asserts Open in Keplr CTA and no `Keplr extension not found` dead-end
- [ ] Portal still canonicalizes Terra bech32 before sign/submit
- [ ] Canonical message golden tests unchanged unless coordinated Rust + SDK update
- [ ] Deep-link builder still origin-binds and rejects `javascript:` / foreign origins
- [ ] Update this skill + README Terra section + gap Terra rows if invariants change

## Quick verify

```bash
cd api && cargo fmt --check && cargo clippy --all-targets -- -D warnings
cd api && cargo test --lib terra
cd api && cargo test --test integration_test terra
cd web && npm test -- keplrMobile
cd web && npm run test:e2e -- terra-sign
```

## Manual (optional)

1. **Desktop Chrome + Keplr extension:** `/sign/terra-classic?property=…` → Connect & sign → `signed_latest: true` (issue #1 path).
2. **Android Chrome (no extension):** same URL shows Open in Keplr + Copy link; Connect & sign does not dead-end on “Keplr extension not found”.
3. **Open in Keplr in-app:** deep link opens this sign URL in the Keplr browser; `window.keplr` is injected; sign succeeds; allowlisted `redirect_uri` returns.
