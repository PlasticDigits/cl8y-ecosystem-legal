---
name: terra-classic-adr036
description: >-
  Terra Classic (TERRA_CLASSIC) Keplr signArbitrary + API ADR-036 verification
  invariants for CL8Y Legal. Use when changing portal Terra signing, API
  verify/terra.rs, account normalization, or wallet submit for columbus-5.
---

# Terra Classic / Keplr ADR-036

## Scope

- **In scope:** Web portal `/sign/terra-classic` + API `TERRA_CLASSIC` wallet verify.
- **Out of scope:** Telegram, Solana, WalletConnect, Terra 2.0 (`phoenix-1`).

Cross-links:

- Issue: GitLab `#1` (Fix Terra Classic / Keplr ADR-036)
- Portal: [`web/src/pages/terra.ts`](../../web/src/pages/terra.ts)
- API verify: [`api/src/verify/terra.rs`](../../api/src/verify/terra.rs)
- Account normalize: [`api/src/account.rs`](../../api/src/account.rs)
- E2E mock: [`web/e2e/helpers/keplr-wallet.ts`](../../web/e2e/helpers/keplr-wallet.ts)
- Gap note: [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md) (Terra finding resolved for portal)
- Integrator overview: [`README.md`](../../README.md#terra-classic-keplr)

## Invariants (do not break)

1. **Chain id for Keplr enable / getKey / signArbitrary** is `columbus-5` (Terra Classic). Do not silently switch to Terra 2.0.
2. **Frontend API:** call `window.keplr.signArbitrary(chainId, signerAddress, data)` — never `getOfflineSigner(...).signArbitrary(address, data)`.
3. **Signed payload:** Keplr wraps the canonical CL8Y acceptance UTF-8 string as ADR-036 amino `sign/MsgSignData`. The **legal message text** stays the shared canonical builder (`api/src/message.rs` / SDK `message.ts`); only the crypto envelope is ADR-036.
4. **ADR-036 amino document** (what is SHA-256 hashed before secp256k1 verify) always has:
   - `chain_id: ""`, `memo: ""`
   - `account_number: "0"`, `sequence: "0"`
   - `fee: { gas: "0", amount: [] }`
   - `msgs: [{ type: "sign/MsgSignData", value: { signer, data: base64(message) } }]`
   - CosmJS `serializeSignDoc` key order + `&`/`<`/`>` escapes
5. **API verify** must hash that serialized doc (via `k256` `Verifier`, which SHA-256s the bytes), not raw `message.as_bytes()`.
6. **Pubkey binding:** compressed secp256k1 pubkey (33 bytes, base64) must derive `terra1…` bech32 (HRP `terra`, 20-byte ripemd160(sha256(pubkey))).
7. **Address validation:** full bech32 checksum — not `starts_with("terra")`.
8. **No legacy raw-ECDSA accept path** — old wrong verify never worked against Keplr; do not dual-verify.
9. **Submit fields:** `POST /api/v1/signatures/wallet` with `network: "TERRA_CLASSIC"`, `signature` + `pubkey` base64 (Keplr `pub_key.value`).
10. **Low-S ECDSA:** verifiers normalize compact signatures to low-S (Keplr/CosmJS convention). E2E mocks must not emit high-S.

## Agent checklist

When editing this path:

- [ ] Unit tests in `api/src/verify/terra.rs` still include a CosmJS/Keplr vector and reject raw-byte signatures
- [ ] `cargo test` (lib + integration with Postgres) green for Terra
- [ ] Playwright Terra mock (`web/e2e/terra-sign.spec.ts`) still uses `signArbitrary(chainId, signer, data)`
- [ ] Canonical message golden tests unchanged unless coordinated Rust + SDK update
- [ ] Update this skill + README Terra section if invariants change

## Quick verify

```bash
cd api && cargo test --lib terra
cd api && cargo test --test integration_test terra
cd web && npm run test:e2e -- terra-sign
```
