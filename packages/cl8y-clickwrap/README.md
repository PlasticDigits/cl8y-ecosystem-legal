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

## Headless usage

```ts
import {
  buildSignUrl,
  createClient,
  pollUntilSigned,
} from "@plasticdigits/cl8y-clickwrap";

const client = createClient();

const status = await client.getSignatureStatus("cl8y.com", "EVM", address);
if (!status.signed_latest) {
  const terms = await client.getTermsLatest("cl8y.com");
  window.location.href = buildSignUrl(terms.sign_urls.evm, {
    redirectUri: window.location.href,
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

Terra Classic signing on the hosted portal uses Keplr ADR-036 (`columbus-5`). Integrators should redirect to `sign_urls.terra` / `terra_classic` rather than reimplementing verify. Crypto invariants: [`skills/terra-classic-adr036/SKILL.md`](../../skills/terra-classic-adr036/SKILL.md).

## React exports

- `TermsGate` — drop-in gate component
- `useSignatureStatus` — headless hook with focus re-poll

## Publish

From `packages/cl8y-clickwrap`:

1. Bump `version` in `package.json`
2. `npm run build`
3. `npm publish --access public`

Requires publish access to the `@plasticdigits` npm organization.
