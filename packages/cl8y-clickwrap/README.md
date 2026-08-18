# @plasticdigits/cl8y-clickwrap

CL8Y Legal clickwrap SDK — API client and React components for terms acceptance on CL8Y ecosystem sites.

Sites check signature status against the [CL8Y Legal API](https://api.terms.cl8y.com), then redirect users to the hosted signing portal at [terms.cl8y.com](https://terms.cl8y.com) when they have not accepted the latest terms for a property.

## Install

```bash
npm install @plasticdigits/cl8y-clickwrap
```

Peer dependencies for React usage:

```bash
npm install react react-dom
```

## Prerequisites

- Your site hostname must be registered as a **property** (e.g. `cl8y.com`).
- For browser-side API calls, your origin must be listed in the API server's `CORS_ORIGINS`.

## Quick start (React)

```tsx
import { createClient } from "@plasticdigits/cl8y-clickwrap";
import { TermsGate } from "@plasticdigits/cl8y-clickwrap/react";

const client = createClient();

export function App() {
  const address = useWalletAddress();

  return (
    <TermsGate
      client={client}
      property="cl8y.com"
      network="EVM"
      account={address}
      redirectUri={window.location.href}
      appName="My Dapp"
    >
      <Dashboard />
    </TermsGate>
  );
}
```

`TermsGate` polls signature status, shows an accept UI when unsigned, and renders children once `signed_latest` is true. After the user returns from the signing portal, status is re-checked on window focus.

The hosted portal (`/sign/evm`, `/sign/terra-classic`) shows the **full terms text on-page** with an explicit consent checkbox before wallet connect — see [`skills/portal-sign-disclosure/SKILL.md`](../../skills/portal-sign-disclosure/SKILL.md) and GitLab issue #2. `TermsGate` still links to `GET /api/v1/terms/latest/content` for integrators embedding the gate off-portal.

## Headless usage

```ts
import {
  buildSignUrl,
  createClient,
  isAllowedRedirectUri,
  pollUntilSigned,
} from "@plasticdigits/cl8y-clickwrap";

const client = createClient();

const status = await client.getSignatureStatus("cl8y.com", "EVM", address);
if (!status.signed_latest) {
  const terms = await client.getTermsLatest("cl8y.com");
  const redirectUri = window.location.href;
  // Portal enforces VITE_REDIRECT_URI_ALLOWLIST; preflight locally if you want fail-fast UX.
  if (!isAllowedRedirectUri(redirectUri, { allowlist: ["https://cl8y.com"], allowLocalhost: true })) {
    throw new Error("redirect_uri is not allowlisted on the signing portal");
  }
  window.location.href = buildSignUrl(terms.sign_urls.evm, {
    redirectUri,
    appName: "My Dapp",
  });
}

// Optional: wait after redirect-back
await pollUntilSigned(client, {
  property: "cl8y.com",
  network: "EVM",
  account: address,
});
```

## API client

```ts
import { createClient } from "@plasticdigits/cl8y-clickwrap";

const client = createClient({
  apiBaseUrl: "https://api.terms.cl8y.com", // default
  termsBaseUrl: "https://terms.cl8y.com",   // default
});

await client.getTermsLatest("cl8y.com");
await client.getTermsContent("cl8y.com");
await client.getSignatureStatus("cl8y.com", "EVM", "0x…");
await client.submitWallet({ /* … */ });
await client.submitTelegram({ /* … */ });
```

### Networks

| SDK `Network`   | API value        | Sign URL key     |
|-----------------|------------------|------------------|
| `EVM`           | `EVM`            | `evm`            |
| `Solana`        | `SOLANA`         | `solana`         |
| `TerraClassic`  | `TERRA_CLASSIC`  | `terra_classic`  |
| `Telegram`      | `TELEGRAM`       | `telegram`       |

Terra Classic signing on the hosted portal uses Keplr ADR-036 (`columbus-5`). Integrators should redirect to `sign_urls.terra` / `terra_classic` rather than reimplementing verify. Mobile Chrome users complete the same portal page inside the **Keplr in-app browser** (Open in Keplr CTA — GitLab #9); do not reimplement WalletConnect on the integrator site for T&C. Crypto + mobile-fallback invariants: [`skills/terra-classic-adr036/SKILL.md`](../../skills/terra-classic-adr036/SKILL.md).

## Redirect URI safety

The hosted portal (`terms.cl8y.com`) only auto-navigates to `redirect_uri` values whose **origin** is on `VITE_REDIRECT_URI_ALLOWLIST` (HTTPS), or loopback when `VITE_ALLOW_LOCALHOST_REDIRECT` is enabled. See root [`skills/security-ops/SKILL.md`](../../skills/security-ops/SKILL.md).

SDK helpers (optional for integrators; portal still enforces):

- `sanitizeRedirectUri(uri, { allowlist, allowLocalhost })` → safe URL or `null`
- `isAllowedRedirectUri(uri, opts)` → boolean

`buildSignUrl` / `appendSignParams` still pass through `redirectUri` unchanged so server-side integrators with known-good URLs are not broken.

## React exports

- `TermsGate` — drop-in gate component
- `useSignatureStatus` — headless hook with focus re-poll

## Publish

From `packages/cl8y-clickwrap`:

1. Bump `version` in `package.json`
2. `npm run build`
3. `npm publish --access public`

Requires publish access to the `@plasticdigits` npm organization.
