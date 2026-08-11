# CL8Y Legal — T&C signing platform

Central service for CL8Y ecosystem Terms & Conditions: global legal versions, **per-property acceptance** (website hostname or Telegram channel `chat_id`), public API for dapps, and signing UI.

## Prerequisites

- [rustup](https://rustup.rs/) — stable toolchain (`rustup default stable`)
- [nvm](https://github.com/nvm-sh/nvm) — Node 22+ (`nvm install 22 && nvm use 22`)
- PostgreSQL 16+ (local install, not Docker)

## Concepts

- **Terms version** — global (one latest at a time). Published from [`TERMS_AND_CONDITIONS.txt`](TERMS_AND_CONDITIONS.txt).
- **Property** — where acceptance applies:
  - Website: `cl8y.com`, `yieldomega.com`
  - Telegram channel: `-1001234567890` (chat id)
- **Signature** — one record per `(property, terms version, network, account)`.

Signing on `cl8y.com` does not satisfy `yieldomega.com`. A version bump requires re-signing on each property.

## Production

| Service | URL |
|---------|-----|
| **Web app** | [https://terms.cl8y.com](https://terms.cl8y.com) |
| **API** | [https://api.terms.cl8y.com](https://api.terms.cl8y.com) |

**API** (`.env` on the API host — see [`.env.example`](.env.example)):

- `LEGAL_PUBLIC_BASE_URL=https://terms.cl8y.com` — sign links in JSON point at the web app
- `CORS_ORIGINS=https://terms.cl8y.com` — allow the legal portal (add dapp origins as needed, e.g. `https://cl8y.com`)

**Web** (`web/.env` for production build):

- `VITE_API_BASE_URL=https://api.terms.cl8y.com`

```bash
# Build static site for terms.cl8y.com
npm ci
VITE_API_BASE_URL=https://api.terms.cl8y.com npm run build

# Run API behind reverse proxy → api.terms.cl8y.com
cd api && cargo run --release
```

## Quick start (local)

### 1. PostgreSQL

Create the dev database (once):

```bash
sudo -u postgres psql -c "CREATE USER cl8y_legal WITH PASSWORD 'cl8y_legal' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE cl8y_legal OWNER cl8y_legal;"
```

Or, if your user can create databases locally:

```bash
createdb cl8y_legal
```

### 2. Environment

```bash
cp .env.example .env
# For local dev, override production defaults in .env:
#   LEGAL_PUBLIC_BASE_URL=http://localhost:8080
#   CORS_ORIGINS=http://localhost:5173,http://localhost:8080
#   ADMIN_TOKEN=<strong-local-secret>   # required (or ALLOW_INSECURE_DEFAULTS=true)

cp web/.env.example web/.env
# For local dev: VITE_API_BASE_URL=  (empty — Vite proxies /api)
# Optional redirects after Accept:
#   VITE_REDIRECT_URI_ALLOWLIST=https://cl8y.com
#   VITE_ALLOW_LOCALHOST_REDIRECT=true
```

### 3. API (Rust)

```bash
source "$HOME/.cargo/env"   # if rustup not on PATH
cd api
cargo run
```

Runs on http://localhost:8080 by default. On first start, syncs terms from GitLab when configured.

### 4. Web (Vite)

In a second terminal:

```bash
npm install
npm run build:sdk
cd web && npm run dev
```

Or from the repo root: `make web`

UI: http://localhost:5173 (proxies `/api` to the API).

### 5. Production-like UI from API (optional)

Build the frontend and serve it from the API:

```bash
npm run build
cd api
STATIC_DIR=../web/dist cargo run
```

Then open http://localhost:8080.

### Terms updates (from GitLab)

The API loads terms from the GitLab raw file on `main` ([`TERMS_AND_CONDITIONS.txt`](https://gitlab.com/PlasticDigits/cl8y-ecosystem-legal/-/raw/main/TERMS_AND_CONDITIONS.txt)). Sync is **content-hash aware** (see GitLab [#6](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/6) and [`skills/security-ops/SKILL.md`](skills/security-ops/SKILL.md) § Terms oracle):

- Same `Version:` **and** same `content_sha256` → `unchanged` (no duplicate publish).
- Same `Version:` with a **different body** → **rejected**; operators must bump `Version:` (hash is the safety net, not a substitute for labeling discipline).
- A previously published label cannot become `is_latest` again unless `FORCE_TERMS_DOWNGRADE=true` (dev/ops only; logged).
- Acceptance messages bind `Content-SHA256: <hex>` (API + SDK + portal must deploy together — **breaking** message format).

- **On startup** (if `TERMS_SYNC_ON_STARTUP=true`) — primary unattended path
- **Every 4 hours** (`TERMS_SYNC_INTERVAL_HOURS`, default `4`) — primary unattended path
- **On demand (ops):** `POST /update_terms` with `Authorization: Bearer <ADMIN_TOKEN>` (same token as `/admin/*`; rate-limited to **1 request per second per IP**). Unauthenticated calls return **401**. Prefer this over inventing a second token scheme.

```bash
curl -X POST https://api.terms.cl8y.com/update_terms \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Local: curl -X POST http://localhost:8080/update_terms -H "Authorization: Bearer $ADMIN_TOKEN"
# {"status":"unchanged","version_label":"Draft 1.3"}
# or {"status":"published","version_label":"Draft 1.4",...}
```

Liveness: `GET /health` → `{"status":"ok"}` (no auth; safe for load balancers / Playwright readiness).

### Security ops invariants

Documented for operators and agents in [`skills/security-ops/SKILL.md`](skills/security-ops/SKILL.md):

| Control | Behavior |
|---------|----------|
| `ADMIN_TOKEN` | Required at boot. Refuses known default `dev-admin-token` unless `ALLOW_INSECURE_DEFAULTS=true` (local/CI only). |
| `/update_terms` | Bearer admin auth; POST-only. |
| Terms oracle | Hash-aware sync; reject label reuse / silent drift; anti-downgrade unless `FORCE_TERMS_DOWNGRADE`. |
| Acceptance message | Binds `Content-SHA256` (coordinated API+SDK+web release). |
| Admin Bearer compare | Constant-time (`subtle`). |
| `redirect_uri` | Portal allowlists origins via `VITE_REDIRECT_URI_ALLOWLIST` (+ optional localhost). Unsafe URIs never auto-navigate. |
| Rate-limit IP | TCP peer by default. `TRUSTED_PROXY_CIDRS` enables XFF; **rightmost** valid hop is used. |

Gap analysis items 4–7 (portal/API ops) in [`gaps/GAP_1786322222.md`](gaps/GAP_1786322222.md) track this hardening.

## Public API

Base URL: `https://api.terms.cl8y.com`

All acceptance endpoints require `property` (hostname or Telegram `chat_id`).

| Method | Path |
|--------|------|
| GET | `/api/v1/terms/latest?property=cl8y.com` |
| GET | `/api/v1/terms/latest/content?property=cl8y.com` |
| GET | `/api/v1/signatures/status?property=cl8y.com&network=EVM&account=0x…` |
| POST | `/api/v1/signatures/wallet` |
| POST | `/api/v1/signatures/telegram` |

Signing UI (web app at `https://terms.cl8y.com`): `/sign/evm?property=cl8y.com`, `/sign/terra-classic?property=cl8y.com`, `/sign/telegram?property=-100…`

Rate limits: per-IP (see `.env.example`).

### Terra Classic (Keplr)

Network id: `TERRA_CLASSIC`. Portal chain: Terra Classic **`columbus-5`** (not Terra 2.0).

The portal calls Keplr `signArbitrary(columbus-5, signer, data)`. The API verifies CosmJS-compatible ADR-036 amino `sign/MsgSignData` digests and binds the compressed secp256k1 pubkey to the claimed `terra1…` bech32 address (checksummed; not prefix-only).

- Crypto invariants: [`skills/terra-classic-adr036/SKILL.md`](skills/terra-classic-adr036/SKILL.md)
- Playwright: mocked Keplr in `web/e2e/terra-sign.spec.ts` (see `web/e2e/helpers/keplr-wallet.ts`)
- Verify locally: `cd api && cargo test --lib terra && cargo test --test integration_test terra` and `cd web && npm run test:e2e -- terra-sign` (Playwright workers=5 via `playwright.config.ts`).

**Migration note:** There is no dual-verify for the previous incorrect raw-ECDSA server path — that path never matched production Keplr, so stored Terra proofs (if any) from the broken verifier are not accepted.

## Portal sign UX (EVM / Terra Classic)

EVM and Terra Classic sign pages share [`web/src/signShell.ts`](web/src/signShell.ts):

1. On load, fetch latest terms metadata + full content for the `property`.
2. Show version label, effective date, and scrollable terms body (text nodes only — no `innerHTML`).
3. **Consent gate:** Connect & sign stays disabled until terms load successfully **and** the user checks *I have read and agree to the Terms & Conditions* (checkbox only; not scroll-to-bottom).
4. After wallet connect, if the account already has `signed_latest`, show success without forcing a re-sign.

Solana and Telegram sign pages are unchanged for now (see GitLab issue #2). Agent/integrator notes: [`skills/portal-sign-disclosure/SKILL.md`](skills/portal-sign-disclosure/SKILL.md). Related gap analysis: [`gaps/GAP_1786322222.md`](gaps/GAP_1786322222.md).

## Integrator flow

1. `GET /api/v1/terms/latest?property=<your-hostname>`
2. Poll `GET /api/v1/signatures/status?property=…&network=…&account=…`
3. If `signed_latest` is false, send user to `sign_urls.evm` (or telegram/solana/terra)
4. After sign, poll until `signed_latest` is true

### Clickwrap SDK

For JavaScript/TypeScript sites, use [`@plasticdigits/cl8y-clickwrap`](packages/cl8y-clickwrap/README.md):

```bash
npm install @plasticdigits/cl8y-clickwrap
```

The package provides an API client, URL/poll helpers, and React components (`TermsGate`, `useSignatureStatus`) that implement the integrator flow above.

## Tests

Requires Postgres on `DATABASE_URL` (see `.env.example`). End-to-end tests start the Rust API with `ADMIN_TOKEN=test-admin` and publish terms via authenticated `POST /update_terms` (network access to GitLab raw URL, or an already-published DB).

**Coverage focus (GitLab [#4](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/4)):** **EVM** and **Terra Classic** wallet verify/submit/status are proven at unit, API integration, and Playwright e2e (mock wallets). **Portal** pages assert terms disclosure, consent gating, and `redirect_uri` allowlisting. Security ops from #3 (`/update_terms` Bearer, XFF trust, admin routes) have API unit + integration coverage; e2e global-setup uses Bearer sync. **Out of scope for #4:** new Telegram/Solana e2e, bot tests, OpenAPI — see [`skills/testing-coverage/SKILL.md`](skills/testing-coverage/SKILL.md) and related skills ([`terra-classic-adr036`](skills/terra-classic-adr036/SKILL.md), [`security-ops`](skills/security-ops/SKILL.md), [`portal-sign-disclosure`](skills/portal-sign-disclosure/SKILL.md)).

```bash
source "$HOME/.cargo/env"
cd api && cargo test

npm install          # root workspaces (SDK + web)
npm run test:sdk     # clickwrap SDK unit tests
npm run test:web     # portal unit tests (builds SDK first via workspace)
cd web && npm run test:e2e   # Playwright: API + Vite dev server; needs Postgres
```

CI runs `test:rust`, `test:clickwrap`, `test:web` (Vitest), and `test:e2e` (Postgres + Chromium Playwright, 5 workers) in [`.gitlab-ci.yml`](.gitlab-ci.yml).

## Secret scanning (Gitleaks)

CI runs [Gitleaks](https://github.com/gitleaks/gitleaks) on merge requests and `main` (see [`.gitleaks.toml`](.gitleaks.toml)).

```bash
gitleaks detect --source . --config .gitleaks.toml --verbose
```

Never commit `.env` files (only [`.env.example`](.env.example) and [`web/.env.example`](web/.env.example)).

## Telegram enforcement bot (`@cl8ytermsbot`)

Rust bot in [`bot/`](bot/) for allowed supergroups only. It:

- Leaves groups not listed in `ALLOWED_CHAT_USERNAMES` / `ALLOWED_CHAT_IDS` (see [`bot/groups.md`](bot/groups.md))
- Tracks members who have not signed the latest terms (via the legal API)
- Posts signing reminders every 6 hours (4× per day; `REMINDER_INTERVAL_HOURS`)
- Kicks members who remain non-compliant after `GRACE_PERIOD_DAYS` (default 30)
- On terms version change: announces in chat, attaches full terms as a `.txt` document, and resets compliance deadlines

Users can sign via:

1. **WebApp** — buttons in group reminders or DM `/start` menu
2. **DM** — [t.me/cl8ytermsbot](https://t.me/cl8ytermsbot) → pick a group or **Sign all groups**

Requires the same `TELEGRAM_BOT_TOKEN` as the API and `VITE_TELEGRAM_BOT_NAME=cl8ytermsbot` on the web build.

```bash
cp bot/.env.example bot/.env
# Set ALLOWED_CHAT_USERNAMES, TELEGRAM_BOT_TOKEN, DATABASE_URL, LEGAL_* URLs

cd bot && cargo run --release
```

Run the API first so migrations create `bot_chat_state` / `bot_member_compliance` tables.

## Configuration

See [`.env.example`](.env.example) and [`bot/.env.example`](bot/.env.example).
