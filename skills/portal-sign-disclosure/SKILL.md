# Skill: Portal sign-page terms disclosure

Guidance for third-party / agent players changing CL8Y Legal signing UX.

**Issue:** GitLab [#2](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/2)  
**Gap:** [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md) (Portal UX — terms disclosure)  
**Implementation:** [`web/src/signShell.ts`](../../web/src/signShell.ts) (EVM + Terra Classic)

## When to use

- Editing `/sign/evm` or `/sign/terra-classic` flows
- Extending the same disclosure pattern to Solana / Telegram (still postponed unless explicitly scoped)
- Changing consent gating, terms fetch, or sign-page DOM helpers

## Invariants (do not break)

1. **Notice before wallet:** Full latest terms text is visible before Connect & sign runs any wallet API.
2. **Version + effective date** are shown near the terms body (from `GET /api/v1/terms/latest`).
3. **Safe render:** Terms body uses text nodes only (`el` / `textContent`). Never `innerHTML` for API content or `property` query values.
4. **Consent gate:** Agree checkbox stays disabled until the user scrolls the terms body to the bottom (or content fits without scrolling). CTA disabled until terms load **and** the user checks “I have read and agree…”. Document any gate change in the MR. `signShell` must reset `busy` after `onSign` settles (success, throw, **or early return**) so Connect & sign re-enables — GitLab #10.
5. **Fetch once:** Metadata + content fetched once per page load (`getTermsLatest` + `getTermsContent` in parallel). No refetch storms on checkbox toggle.
6. **Canonical message lockstep:** Do not alter `buildWalletMessage` / signed message text without API + SDK golden-test coordination. Messages must include `Content-SHA256` from `terms.content_sha256` (GitLab [#6](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/6), [`security-ops`](../security-ops/SKILL.md)).
7. **Errors visible:** Terms fetch failure shows a clear alert; CTA must not silently enable.
8. **redirect_uri:** Do not weaken open-redirect hardening; success redirect stays after acceptance.
9. **Missing injected wallet is not a dead-end (GitLab #15 / #9):** never throw `No EVM wallet found (install MetaMask or similar)` as the only UI. EVM shows Open in MetaMask, Open in Binance Web3, Copy link, and in-page WalletConnect when `VITE_WC_PROJECT_ID` is set. Do not tell phones to install a desktop extension. Idle/error copy is retail-short (no “EIP-191” / “EIP-6963”).
10. **EVM extraControls are in scope.** Terra and EVM both pass `extraControls` into `renderSignShell`. Do **not** strip EVM CTAs as “out of scope.” Do **not** mount Open in Keplr / Terra picker on `/sign/evm`, or MetaMask/Binance CTAs on Terra.
11. **EVM deep-link target is this portal sign URL** (`origin + pathname + search`). Never encode query-supplied `redirect_uri` as the Open-in-app target. Fail closed on non-http(s) and origin mismatch (`web/src/evm/deeplink.ts`). Copy-link copies the portal URL, not a wallet host.
12. **EVM WalletConnect** uses Legal-owned `VITE_WC_PROJECT_ID` (same as Galaxy Station). Hide WC when unset. `personal_sign` of the canonical legal UTF-8 message only — no `eth_sign` of a hash, no silent EIP-712/SIWE. Pairing hrefs: user-gesture `<a>` + allowlist (`wc:`, MetaMask, Binance `cedefi`). Do not copy DEX/ustr-cmm Cloud ids.
13. **Account continuity:** if `account=0x…` is on the query string, a different connected address is a hard fail (GitLab #11 continuity). Recovered signer must still match `account_id` server-side.
14. **EIP-1193 discovery:** resolve from EIP-6963, `ethereum.providers[]`, `window.ethereum`, `window.BinanceChain`; wait briefly for late inject. Several providers → user pick; never silently sign with a hidden wallet.
15. **Safe wallet markup:** wallet names, pairing URIs, and query values stay text nodes / attributes. Never `innerHTML` of EIP-6963 `icon` SVGs.

## Shared entry point

Prefer `renderSignShell` in `web/src/signShell.ts` over duplicating markup in network pages. Network-specific wallet code stays in `web/src/pages/evm.ts` (`web/src/evm/`) / `terra.ts` (`web/src/terra/`) via `onSign`.

- Terra Classic `extraControls`: wallet picker + WalletConnect pairing + Open in Keplr — GitLab [#11](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/11) / [#9](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/9) / [`terra-classic-adr036`](../terra-classic-adr036/SKILL.md)
- EVM `extraControls`: EIP-1193 picker + WalletConnect pairing + Open in MetaMask / Open in Binance Web3 / Copy link — GitLab [#15](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/15)

## Tests to keep green

Full layer map: [`skills/testing-coverage/SKILL.md`](../testing-coverage/SKILL.md).

- Unit: `web/src/signShell.test.ts` (XSS-as-text, consent gate, load error, optional `extraControls`)
- Unit: `web/src/evm/*.test.ts` (provider discovery, deeplink allowlist, claimed-account, WC pairing)
- E2E: `web/e2e/sign-pages.spec.ts` (terms visible + gate on EVM/Terra; EVM has no Open in Keplr, does show Open in MetaMask when no provider)
- E2E: `web/e2e/evm-sign.spec.ts` (injected mock, EIP-6963, BinanceChain, late inject, WC mock, missing-provider CTA, claimed-account mismatch)
- Terra wallets: `web/e2e/terra-sign.spec.ts` (Keplr, Leap, LUNC Dash WC mock, missing-Keplr CTA) + `web/src/terra/*.test.ts` + `web/src/keplrMobile*.test.ts`

## Out of scope unless asked

- Solana / Telegram sign-page disclosure (reuse `renderSignShell` when ready)
- i18n, full redesign, RainbowKit / wagmi app-wide modal
- Treating the UI consent checkbox as authentication (server still requires a valid wallet signature)
- Weakening API EIP-191 verify (`api/src/verify/evm.rs`)
