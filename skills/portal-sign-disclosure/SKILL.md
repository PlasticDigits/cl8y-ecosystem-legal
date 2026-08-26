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
4. **Consent gate:** Agree checkbox stays disabled until the user scrolls the terms body to the bottom (or content fits without scrolling). CTA disabled until terms load **and** the user checks “I have read and agree…”. Document any gate change in the MR.
5. **Fetch once:** Metadata + content fetched once per page load (`getTermsLatest` + `getTermsContent` in parallel). No refetch storms on checkbox toggle.
6. **Canonical message lockstep:** Do not alter `buildWalletMessage` / signed message text without API + SDK golden-test coordination. Messages must include `Content-SHA256` from `terms.content_sha256` (GitLab [#6](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/6), [`security-ops`](../security-ops/SKILL.md)).
7. **Errors visible:** Terms fetch failure shows a clear alert; CTA must not silently enable.
8. **redirect_uri:** Do not weaken open-redirect hardening; success redirect stays after acceptance.

## Shared entry point

Prefer `renderSignShell` in `web/src/signShell.ts` over duplicating markup in network pages. Network-specific wallet code stays in `web/src/pages/evm.ts` / `terra.ts` via `onSign`. Terra Classic may pass optional `extraControls` (wallet picker + WalletConnect pairing + Open in Keplr — GitLab [#11](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/11) / [#9](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/9) / [`terra-classic-adr036`](../terra-classic-adr036/SKILL.md)); EVM must omit it.

## Tests to keep green

Full layer map: [`skills/testing-coverage/SKILL.md`](../testing-coverage/SKILL.md).

- Unit: `web/src/signShell.test.ts` (XSS-as-text, consent gate, load error, optional `extraControls`)
- E2E: `web/e2e/sign-pages.spec.ts` (terms visible + gate on EVM/Terra; EVM has no Open in Keplr)
- E2E: `web/e2e/evm-sign.spec.ts` (consent then mock-wallet accept)
- Terra wallets: `web/e2e/terra-sign.spec.ts` (Keplr, Leap, LUNC Dash WC mock, missing-Keplr CTA) + `web/src/terra/*.test.ts` + `web/src/keplrMobile*.test.ts`

## Out of scope unless asked

- Solana / Telegram sign-page disclosure (reuse `renderSignShell` when ready)
- i18n, full redesign, multi-wallet connectors
- Treating the UI consent checkbox as authentication (server still requires a valid wallet signature)
