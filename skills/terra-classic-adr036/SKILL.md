---
name: terra-classic-adr036
description: >-
  Terra Classic (TERRA_CLASSIC) ADR-036 verification + portal multi-wallet
  signing (ustr-cmm matrix, GitLab #11) and Keplr Mobile Open-in-Keplr fallback
  (#9). Use when changing portal Terra signing, WalletConnect pairing,
  Keplr Mobile deeplinks, API verify/terra.rs, account normalization, wallet
  submit, CI rules affecting test:rust/test:e2e, or columbus-5 wallet mocks.
---

# Terra Classic ADR-036 + ustr-cmm wallet matrix

## Scope

- **In scope:** Web portal `/sign/terra-classic` + API `TERRA_CLASSIC` wallet verify + injected Station / Keplr / Leap / Cosmostation + in-page WalletConnect (LUNC Dash, Galaxy Station) + mobile Open-in-Keplr CTA.
- **Out of scope:** Telegram, Solana, Terra 2.0 (`phoenix-1`), pushing ADR-036 into integrators (ustr-cmm stays SDK-only).

Cross-links:

- Issue: GitLab `#1` (Fix Terra Classic / Keplr ADR-036) — MR `!5`
- Issue: GitLab `#9` (mobile Chrome `window.keplr` missing) — Open in Keplr fallback
- Issue: GitLab `#11` (every ustr-cmm wallet, not Keplr-only)
- Portal: [`web/src/pages/terra.ts`](../../web/src/pages/terra.ts)
- Wallet matrix + sign: [`web/src/terra/`](../../web/src/terra/)
- Mobile Keplr fallback: [`web/src/keplrMobile.ts`](../../web/src/keplrMobile.ts), [`web/src/keplrMobileUi.ts`](../../web/src/keplrMobileUi.ts)
- API verify: [`api/src/verify/terra.rs`](../../api/src/verify/terra.rs)
- Account normalize: [`api/src/account.rs`](../../api/src/account.rs)
- Wallet submit + message bind: [`api/src/signatures.rs`](../../api/src/signatures.rs), [`api/src/message.rs`](../../api/src/message.rs)
- Body limit: [`api/src/routes/mod.rs`](../../api/src/routes/mod.rs) (`DefaultBodyLimit` 64 KiB)
- E2E mocks: [`web/e2e/helpers/keplr-wallet.ts`](../../web/e2e/helpers/keplr-wallet.ts), [`web/e2e/helpers/terra-wallets.ts`](../../web/e2e/helpers/terra-wallets.ts), [`web/e2e/terra-sign.spec.ts`](../../web/e2e/terra-sign.spec.ts)
- Integration: [`api/tests/integration_test.rs`](../../api/tests/integration_test.rs) (`integration_terra_classic_adr036_*`)
- Gap note: [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md)
- Integrator overview: [`README.md`](../../README.md#terra-classic-ustr-cmm-wallet-set)
- SDK account param: [`packages/cl8y-clickwrap/src/urls.ts`](../../packages/cl8y-clickwrap/src/urls.ts)
- CI workflow: [`.gitlab-ci.yml`](../../.gitlab-ci.yml) (MR pipelines must run `test:rust` + `test:e2e`)
- Tests map: [`skills/testing-coverage/SKILL.md`](../testing-coverage/SKILL.md)
- ustr-cmm (connect only, no ADR-036): `skills/frontend-legal-clickwrap` in PlasticDigits2/ustr-cmm
- DEX pairing UX reference (connect, not Legal sign): cl8y-dex-terraclassic `skills/AGENTS_FRONTEND_WALLETCONNECT_MOBILE.md`

## Wallet matrix (tracks ustr-cmm)

If ustr-cmm `WalletButton` / `wallet.ts` adds or removes a Terra Classic wallet, update [`web/src/terra/matrix.ts`](../../web/src/terra/matrix.ts) and this table.

| Wallet | ustr-cmm connect | Legal sign |
|--------|------------------|------------|
| Terra Station | `window.station` extension | `window.station.keplr.signArbitrary` |
| Keplr | `window.keplr` (Trust if Keplr-compat) | `window.keplr.signArbitrary` |
| Leap | `window.leap` | `window.leap.signArbitrary` |
| Cosmostation | `window.cosmostation` | `window.cosmostation.providers.keplr.signArbitrary` |
| LUNC Dash | WalletConnect mobile | In-page WC v1; **`signBytes(ADR-036 amino doc)`** — not raw legal message |
| Galaxy Station | WalletConnect mobile | In-page WC v2 `keplr_signArbitrary` (Legal `VITE_WC_PROJECT_ID`) |

Trust Wallet is the Keplr row when it injects a Keplr-compatible provider.

## Invariants (do not break)

1. **Chain id for enable / getKey / signArbitrary** is `columbus-5` (Terra Classic). Do not silently switch to Terra 2.0.
2. **Keplr-compatible frontend API:** call `provider.signArbitrary(chainId, signerAddress, data)` — never `getOfflineSigner(...).signArbitrary(address, data)`.
3. **Address canonicalize:** portal lowercases bech32 (reject mixed case) before `buildWalletMessage` / sign / submit — matches API `normalize_account` re-encode.
4. **Signed payload:** Keplr-compat wallets wrap the canonical CL8Y acceptance UTF-8 string as ADR-036 amino `sign/MsgSignData`. The **legal message text** stays the shared canonical builder (`api/src/message.rs` / SDK `message.ts`); only the crypto envelope is ADR-036.
5. **ADR-036 amino document** (what is SHA-256 hashed before secp256k1 verify) always has:
   - `chain_id: ""`, `memo: ""`
   - `account_number: "0"`, `sequence: "0"`
   - `fee: { gas: "0", amount: [] }`
   - `msgs: [{ type: "sign/MsgSignData", value: { signer, data: base64(message) } }]`
   - CosmJS `serializeSignDoc` key order + `&`/`<`/`>` escapes
6. **API verify** must hash that serialized doc (via `k256` `Verifier`, which SHA-256s the bytes), not raw `message.as_bytes()`.
7. **Pubkey binding:** compressed secp256k1 pubkey (33 bytes, base64) must derive `terra1…` bech32 (HRP `terra`, 20-byte ripemd160(sha256(pubkey))).
8. **Address validation:** full bech32 checksum — not `starts_with("terra")`. Mixed-case rejected by decode; uppercase normalized to lowercase.
9. **No legacy raw-ECDSA accept path** — old wrong verify never worked against Keplr; do not dual-verify. Do not weaken verify to accept LUNC Dash raw `signBytes(message)`.
10. **Submit fields:** `POST /api/v1/signatures/wallet` with `network: "TERRA_CLASSIC"`, `signature` + `pubkey` base64 (Keplr `pub_key.value`).
11. **Low-S ECDSA:** verifiers normalize compact signatures to low-S (Keplr/CosmJS convention). E2E mocks must not emit high-S; unit tests may prove high-S still verifies after normalize.
12. **Message binding:** `submit_wallet` rebuilds canonical message (property, network, account, terms, timestamp) and rejects mismatches — blocks cross-property / cross-account replay.
13. **Request size:** HTTP bodies capped at 64 KiB (`DefaultBodyLimit`) — wallet JSON must stay within this budget.
14. **CI:** changes to this path must keep `lint:rust`, `test:rust`, and `test:e2e` green on **merge request** pipelines (see `.gitlab-ci.yml` `workflow:rules`).
15. **Missing `window.keplr` is not a dead end (GitLab #9 / #11):** never throw `Keplr extension not found` as the only UI. Show the wallet picker (Station / Leap / Cosmostation / LUNC Dash / Galaxy Station) plus **Open in Keplr** (documented universal `https://deeplink.keplr.app/web-browser?url=`) and **Copy link**. Idle copy is retail-short (no “ADR-036”). Do not tell Android Chrome users to install the desktop extension.
16. **Deep-link target is the current portal sign URL** (`origin + pathname + search`). Never encode `redirect_uri` or any other query-supplied URL into the Keplr `url` param (open-redirect). Fail closed on non-http(s) schemes and origin mismatch.
17. **Copy-link copies the portal sign URL**, not `deeplink.keplr.app`. After Open in Keplr, signing still uses invariant 2 (`signArbitrary`) inside the in-app browser.
18. **EVM / Solana / Telegram sign pages stay unchanged.** Terra may pass `extraControls` into `renderSignShell`; other networks must not mount the Terra picker / WC sheet / Keplr fallback.
19. **WalletConnect project id is Legal-owned** (`VITE_WC_PROJECT_ID`). Do not copy ustr-cmm / DEX Cloud ids into git. LUNC Dash WC v1 uses the public LUNC Dash bridge and does not need a Cloud id. Galaxy Station WC is hidden when the id is unset.
20. **LUNC Dash `signBytes`:** pass the pre-serialized ADR-036 amino JSON bytes (`web/src/terra/adr036.ts`, lockstep with `api/src/verify/terra.rs`). Never pass the raw legal message (API would reject). Never pass that amino doc to a Keplr-compat `signArbitrary` (double-wrap).
21. **Account continuity:** if `account` is on the query string, the chosen wallet must sign that `terra1…`. A different session account is a hard fail (not `signed_latest`).
22. **WC pairing:** mobile is not QR-only. User-gesture `<a href>` only. Copy the raw `wc:` URI. Scheme allowlist (`web/src/terra/walletConnectPairing.ts`). Android Galaxy `#Intent` templates become `intent://`. Pairing hrefs must not encode query-supplied `redirect_uri`.
23. **Unknown signer ≠ signed.** Fake `window.leap` / `window.station` in the page still requires server-side ADR-036 verify.
24. **ustr-cmm stays SDK-only** for Legal (redirect + status). Do not implement ADR-036 on the integrator to “fix” this.

## Agent checklist

When editing this path:

- [ ] Unit tests in `api/src/verify/terra.rs` still include a CosmJS/Keplr vector and reject raw-byte signatures
- [ ] `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings` green in `api/` (and `bot/` if touched)
- [ ] `cargo test` (lib + integration with Postgres) green for Terra happy + abuse tests
- [ ] Playwright Terra mocks still use `signArbitrary(chainId, signer, data)` for Keplr-compat wallets
- [ ] Playwright missing-Keplr case asserts Open in Keplr CTA and no `Keplr extension not found` dead-end
- [ ] Playwright includes a non-Keplr injected mock (Leap) and a WC mock (LUNC Dash)
- [ ] Portal still canonicalizes Terra bech32 before sign/submit
- [ ] Canonical message golden tests unchanged unless coordinated Rust + SDK update
- [ ] Deep-link builder still origin-binds and rejects `javascript:` / foreign origins
- [ ] WC pairing allowlist still rejects non-`wc:` / unknown hosts
- [ ] ADR-036 TS serializer still matches the Rust golden fixture
- [ ] Wallet matrix still named as tracking ustr-cmm
- [ ] Update this skill + README Terra section + gap Terra rows if invariants change

## Quick verify

```bash
cd api && cargo fmt --check && cargo clippy --all-targets -- -D warnings
cd api && cargo test --lib terra
cd api && cargo test --test integration_test terra
cd web && npm test
cd web && npm run test:e2e -- terra-sign
```

## Manual (optional)

1. **Desktop Chrome + Station / Keplr / Leap / Cosmostation:** `/sign/terra-classic?property=…` → pick wallet → Connect & sign → `signed_latest: true`.
2. **Android Chrome + LUNC Dash or Galaxy Station:** pick that wallet → Open {wallet} / Copy pairing link → approve → `signed_latest: true` without installing Keplr.
3. **Android Chrome (no wallet chosen):** Open in Keplr + Copy link still works; Connect & sign does not dead-end on “Keplr extension not found”.
4. **Claimed account:** integrator `account=terra1…` that is not the connected wallet must fail closed.
