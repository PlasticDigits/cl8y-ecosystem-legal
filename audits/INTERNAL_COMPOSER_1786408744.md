# Internal Security Audit — CL8Y Ecosystem Legal

| Field | Value |
|-------|-------|
| **Document** | `INTERNAL_COMPOSER_1786408744.md` |
| **Epoch** | `1786408744` |
| **Date (UTC)** | 2026-08-11T00:43:45Z |
| **Commit** | `b9f4a29` (`main`) |
| **Method** | Full-repo static review + Composer 2.5 parallel deep-dives (API, bot/DB, web/SDK/e2e, crypto/economic analogues, attack-surface inventory) |
| **GitLab** | `glab issue list` — no open issues; closed `#1`–`#4` reviewed |
| **Prior art** | Cross-checked against `gaps/GAP_1786322222.md` and `skills/security-ops/SKILL.md` |

**Verdict:** Ops hardening from GitLab `#3` (admin Bearer on `/update_terms`, fail-fast `ADMIN_TOKEN`, trusted-proxy XFF, `redirect_uri` allowlist) and Terra ADR-036 (`#1`) materially improved the security posture. **Two Critical broken identity paths remain** (Telegram WebApp HMAC, Solana sign/verify envelope). Bot enforcement is fail-open into kicks. Smart contracts / classic DeFi attack classes are **N/A** (no on-chain surface); analogues are noted below.

---

## 1. Scope expansion — additional areas analyzed

Before diving into the requested categories, the audit inventory expanded beyond the obvious API/wallet paths:

| Extra area | Why it matters |
|------------|----------------|
| Terms “oracle” pipeline (GitLab raw → sync → `is_latest`) | Supply-chain / downgrade / silent content drift |
| Property auto-upsert on every public read | DB pollution, namespace squatting, enumeration side effects |
| Bot compliance state machine + kick semantics | Wrongful kicks, grace reset bypass |
| Shared Postgres between API and bot | Privilege / leakage across services |
| Static `ServeDir` fallback when `STATIC_DIR` set | Path traversal / mixed origin hosting |
| Portal CSP / framing / third-party Telegram script | Clickjacking, supply chain |
| SDK `TermsGate` + `sign_urls` navigation trust | Integrator phishing via compromised API |
| CI secrets & e2e `ADMIN_TOKEN` defaults | Prod footguns |
| Unbounded in-memory rate-limit maps | Memory DoS |
| Message binding vs `content_sha256` | Legal proof integrity |
| Cross-network / cross-property replay analogues | DeFi replay class mapped to off-chain proofs |
| Dead `api/src/terms_sync.rs` duplicate | Confusion / accidental re-wiring risk |
| OpenAPI / `/ready` absence | Ops blind spots |
| Dependency / supply-chain (no Dependabot; pinned CI images) | Drift & CVE lag |

**Not present in repo (explicitly out of classic DeFi scope):** Solidity/Vyper contracts, AMMs, lending, price oracles, bridges, governance tokens, flash loans, MEV.

---

## 2. System attack surface

```
TERMS_AND_CONDITIONS.txt (GitLab raw)
        │ sync (startup / interval / POST /update_terms + ADMIN_TOKEN)
        ▼
┌───────────────────┐     HTTP      ┌────────────────────┐
│  cl8y-legal-api   │◄─────────────►│  web + clickwrap   │
│  Axum + SQLx      │               └────────────────────┘
└─────────┬─────────┘
          │ shared Postgres
          ▼
┌───────────────────┐     Bot API   ┌────────────────────┐
│  cl8y-terms-bot   │──────────────►│  Telegram groups   │
│  long polling     │               └────────────────────┘
```

### 2.1 HTTP routes & auth

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/health` | None | Liveness only (no DB) |
| `POST` | `/update_terms` | Bearer `ADMIN_TOKEN` | Auth **before** 1 req/s ops limit |
| `GET` | `/api/v1/terms/latest` | None | Auto-upserts property |
| `GET` | `/api/v1/terms/latest/content` | None | Full plaintext terms |
| `GET` | `/api/v1/terms/{version_label}` | None | Historical metadata |
| `GET` | `/api/v1/signatures/status` | None | Compliance disclosure |
| `POST` | `/api/v1/signatures/wallet` | None | EVM / Solana / Terra verify |
| `POST` | `/api/v1/signatures/telegram` | None | Widget or WebApp `init_data` |
| `GET` | `/admin/properties` | Bearer | List properties |
| `DELETE` | `/admin/properties/{kind}/{identifier}` | Bearer | Cascades signatures |

Middleware: 64 KiB body limit, per-IP rate limits, CORS, HTTP trace. Optional `ServeDir` fallback.

### 2.2 Secrets & trust boundaries

| Secret / config | Boundary |
|-----------------|----------|
| `ADMIN_TOKEN` | Ops → API admin + terms sync |
| `TELEGRAM_BOT_TOKEN` | API HMAC verify + bot Telegram API |
| `DATABASE_URL` | API + bot → Postgres |
| `TERMS_GITLAB_RAW_URL` | API outbound fetch (oracle) |
| `TRUSTED_PROXY_CIDRS` | When set, XFF becomes client IP |
| `CORS_ORIGINS` | Browser → API |
| `VITE_REDIRECT_URI_ALLOWLIST` | Portal return navigation |
| Wallet private keys | Client-only (never server) |

---

## 3. Findings (ranked)

Severity guide: **Critical** = broken auth/crypto or production identity path wrong; **High** = privilege / enforcement / integrity impact; **Medium** = abuse, misconfig, missing defense-in-depth; **Low/Info** = hygiene, residual risk.

### Critical

#### C1 — Telegram WebApp `initData` HMAC secret derivation is wrong

| | |
|---|---|
| **Location** | `api/src/telegram.rs:119-126` |
| **Spec** ([Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)) | `secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)` |
| **Code** | `HMAC_SHA256(key="WebAppData", msg=SHA256(bot_token))` |

```119:126:api/src/telegram.rs
    let mut secret_hasher = Sha256::new();
    secret_hasher.update(bot_token.as_bytes());
    let secret_key = secret_hasher.finalize();

    let mut mac_key = HmacSha256::new_from_slice(WEBAPP_DATA_KEY)
        .map_err(|_| AppError::Internal(anyhow::anyhow!("hmac")))?;
    mac_key.update(&secret_key);
    let webapp_secret = mac_key.finalize().into_bytes();
```

**Impact:** Legitimate Mini App / bot WebApp signing **cannot verify**. Path is effectively dead or only “works” with forged/self-consistent wrong hashes (not production Telegram). Login Widget path (SHA256(token) as HMAC key) is separate and unit-tested.

**Tests:** No WebApp golden vector — would have caught this. Widget roundtrip only (`telegram.rs` tests).

---

#### C2 — Solana: portal signs raw UTF-8; API verifies Solana off-chain envelope

| | |
|---|---|
| **API** | `api/src/verify/solana.rs:5-12,37-39` — `0xff \|\| "solana offchain" \|\| LE u64 len \|\| msg` |
| **Portal** | `web/src/pages/solana.ts:55-56` — `signMessage(TextEncoder.encode(message), "utf8")` |

**Impact:** Phantom-style wallets sign raw bytes → API rejects. A custom client that signs the API envelope can succeed while the official portal cannot. Production Solana acceptance is broken / inconsistent.

**DeFi analogue:** Domain-separator / EIP-712 vs `personal_sign` confusion.

**Tests:** Unit roundtrip uses the **same wrong envelope** as the API; no e2e against wallet-realistic signing; CI issue `#4` explicitly deferred Solana.

---

### High

#### H1 — Bot treats API errors as “unsigned” → wrongful kicks

| | |
|---|---|
| **Location** | `bot/src/enforcement.rs:82-90`, `159`, `184-188` |
| **Pattern** | `is_signed_latest(...).await.unwrap_or(false)` |

**Attack / failure:** API outage, rate-limit, or network error → signed users marked non-compliant → `ban_chat_member` after grace. Fail-**open** into punishment.

**Tests:** No bot `cargo test` in CI for kick/error paths.

---

#### H2 — Kick + rejoin resets full grace period (enforcement bypass)

| | |
|---|---|
| **Location** | `bot/src/enforcement.rs:206-209`, `bot/src/db.rs` compliance insert |

Kick does ban→unban and deletes compliance row. Rejoin inserts `required_since = NOW()`. User can cycle forever without signing.

---

#### H3 — Telegram acceptance is auth replay, not a signature over legal text

| | |
|---|---|
| **Location** | `api/src/routes/signatures.rs:149-256`, `api/src/signatures.rs:169-222` |

Server verifies Telegram HMAC, then **builds** the acceptance message and stores proof as auth metadata only. Anyone holding a victim’s valid widget/`init_data` (≤24h for HMAC age; submit also constrained by ±300s `validate_timestamp` on `auth_date`) can register acceptance for **any** Telegram property.

**DeFi analogue:** Intent not cryptographically bound to executed payload.

---

#### H4 — Terms sync oracle: label-only equality; non-monotonic “latest”

| | |
|---|---|
| **Location** | `api/src/terms/sync.rs:69-83`, `api/src/terms.rs` publish |

- Same `Version:` label → skip republish even if body/`content_sha256` changed (silent drift).
- Different label → publish as latest with **no monotonic ordering** (downgrade / rollback if oracle compromised or mis-edited).

**DeFi analogue:** Oracle stale-price / rollback.

Acceptance message binds `version_label` + effective date, **not** `content_sha256` (`api/src/message.rs:12-24`).

---

#### H5 — Unauthenticated property auto-upsert

| | |
|---|---|
| **Location** | `api/src/property.rs:113-120` via status/terms/wallet/telegram |

Any client can create arbitrary website/Telegram properties. Enables table fill, polluted admin lists, and status enumeration scaffolding.

---

#### H6 — Unauthenticated `/signatures/status` compliance enumeration

| | |
|---|---|
| **Location** | `api/src/routes/signatures.rs:80-117` |

Public oracle of `signed_latest` / `signed_version` / `signed_at` for any `(property, network, account)`. Useful for bot; also for adversaries profiling wallets/Telegram IDs.

---

#### H7 — Portal missing clickjacking defenses; Solana/Telegram omit consent UX

| | |
|---|---|
| **Framing** | `web/index.html` — no CSP `frame-ancestors` / `X-Frame-Options` |
| **Consent** | EVM/Terra use `signShell`; `web/src/pages/solana.ts`, `telegram.ts` skip full terms + checkbox |

UI redressing + weakened clickwrap enforceability on unfinished paths.

---

#### H8 — Group admins/creators not exempt from kicks

| | |
|---|---|
| **Location** | `bot/src/enforcement.rs:231-233` `is_active_member` |

Only excludes Left/Banned. Owner/Administrator can be kicked if non-compliant / API fail-open.

---

#### H9 — Shared DB credentials; no least-privilege / RLS between API and bot

| | |
|---|---|
| **Location** | `bot/src/config.rs:48-50`, `api/migrations/002_bot_state.sql`, `docker-compose.yml` |

Bot and API use the same Postgres owner role. No `GRANT`/`REVOKE`, no RLS. Bot-host compromise can read/tamper `signatures` and mass-mark `bot_member_compliance` to force kicks or evade enforcement.

---

#### H10 — Bot → Legal API has no mutual authentication

| | |
|---|---|
| **Location** | `bot/src/api_client.rs:24-34`, `bot/src/config.rs:44-45` |

Bot is an unauthenticated HTTP client to `LEGAL_API_BASE_URL`. Env compromise or DNS/MITM to a hostile API can feed false `signed_latest` and drive wrongful kicks or false compliance.

---

### Medium

| ID | Finding | Location |
|----|---------|----------|
| M1 | `ALLOW_LOCALHOST_PROPERTY` defaults **true** | `api/src/config.rs:70-72` |
| M2 | Terms fetch: no redirect policy / private-IP block (SSRF if env compromised) | `api/src/terms/sync.rs:21-44` |
| M3 | Telegram HMAC compare not constant-time (`!=`); Bearer uses `subtle` | `api/src/telegram.rs:62-64,133-135` |
| M4 | Telegram `auth_date` only rejects too-old, not far-future (before submit skew) | `api/src/telegram.rs:27-30` |
| M5 | Unbounded DashMap rate-limit buckets → memory growth DoS | `api/src/rate_limit.rs` |
| M6 | Broad `TRUSTED_PROXY_CIDRS` → XFF spoof splits rate-limit buckets | `api/src/rate_limit.rs:112-126` |
| M7 | CORS methods/headers `Any` even with origin allowlist; `CORS_ORIGINS=*` fully open | `api/src/routes/mod.rs:49-65` |
| M8 | `DATABASE_URL` silent default credentials (unlike `ADMIN_TOKEN`) | `api/src/config.rs:38-39` |
| M9 | Signature `ON CONFLICT DO UPDATE` overwrites proof (audit ambiguity) | `api/src/signatures.rs:87-89` |
| M10 | Telegram script on **every** page | `web/index.html:7` |
| M11 | SDK/TermsGate navigates to API-provided `sign_urls` without origin check | `packages/cl8y-clickwrap` |
| M12 | No `state` on redirect round-trip; auto-redirect after ~2s | `web/src/ui.ts` |
| M13 | E2E/global-setup hardcodes `ADMIN_TOKEN` fallback `test-admin` | `web/e2e/global-setup.ts`, `playwright.config.ts` |
| M14 | Per-message bot status checks → self-DoS / rate-limit collisions | `bot/src/enforcement.rs:72-91` |
| M15 | No request timeouts / graceful shutdown on API | `api/src/main.rs` |
| M16 | Custom web `base58` (non-standard edge cases; tests lock odd expectations) | `web/src/base58.ts` |
| M17 | Lurkers (pre-bot members who never message) never enter compliance table → never kicked | `bot/src/handlers.rs`, `bot/src/enforcement.rs:170-227` |
| M18 | `/chatid` works in unauthorized groups before leave → chat ID disclosure | `bot/src/handlers.rs:21-24` |

### Low / Informational

| ID | Finding |
|----|---------|
| L1 | Wallet `proof.type` stored but unused in verify |
| L2 | Canonical message string compare not constant-time (non-secret) |
| L3 | Wallet replay within 300s skew → upsert only |
| L4 | EVM message has no chain id (cross-chain ambiguity within EVM) |
| L5 | Terra ADR-036 amino doc uses empty `chain_id` (Keplr-standard; cross-Cosmos context) |
| L6 | `/health` not readiness; no `/ready` |
| L7 | Dead duplicate `api/src/terms_sync.rs` not wired in `lib.rs` |
| L8 | No OpenAPI, audit export, signature revocation, Dependabot |
| L9 | Compose is Postgres-only — easy local/prod drift |
| L10 | Issue `#3` / `#1` remediations confirmed present (see §6) |

---

## 4. Access control & privileges

| Control | Status |
|---------|--------|
| `ADMIN_TOKEN` required at boot | **Good** — rejects missing/empty/`dev-admin-token` unless `ALLOW_INSECURE_DEFAULTS` |
| Constant-time Bearer compare | **Good** — `api/src/auth.rs` + `subtle` |
| `/update_terms` auth before rate limit | **Good** — `update_terms.rs` |
| Admin property list/delete | **Good** — Bearer required |
| Public write routes | Intentional (wallet/Telegram crypto or HMAC) |
| Property creation | **Weak** — open upsert (H5) |
| Bot group allowlist | **Good** — leaves unauthorized chats |
| Bot kick privileges | **Weak** — no admin exemption (H8); fail-open (H1) |
| DB roles | Single app user; no RLS; bot shares tables — trust both processes equally (**H9**) |
| Bot → API | Unauthenticated reads; no mTLS/API key (**H10**) |

---

## 5. Cryptography, replay, economic & oracle analogues

### 5.1 DeFi / smart-contract classes

| Class | Status |
|-------|--------|
| Reentrancy, delegatecall, storage collision | **N/A** — no contracts |
| Flash loans, AMM drainage, sandwich/MEV | **N/A** |
| Price oracle manipulation | **N/A** as price feed; **GitLab terms oracle** applies (H4) |
| Token inflation / mint | **N/A** |
| Governance / vote buying | **N/A** |
| Bridge replay | **N/A**; **cross-property / cross-version replay** applies |

### 5.2 What is sound

- **EVM EIP-191** recovery + address binding (`verify/evm.rs`) — unit + integration multi-property.
- **Terra ADR-036** CosmJS/Keplr canonicalization, bech32 binding, high-S normalize, escape handling — strong unit + integration abuse tests + mock Keplr e2e.
- **Wallet message binding** to property / network / account / version label / timestamp; cross-property Terra replay rejected in integration.
- **Redirect allowlist** rejects `javascript:`, `data:`, protocol-relative, userinfo; HTTPS origin match.
- **XFF** ignored unless peer ∈ `TRUSTED_PROXY_CIDRS`; rightmost hop.

### 5.3 Economic / griefing

- Property spam (H5), status enumeration (H6), rate-limit memory growth (M5), XFF bucket split under bad proxy trust (M6), bot API load (M14), grace reset bypass (H2).

---

## 6. Gap analysis vs current code (`GAP_1786322222`)

| Prior gap | Reality at `b9f4a29` |
|-----------|----------------------|
| Telegram WebApp HMAC wrong | **Still Critical (C1)** |
| Solana envelope mismatch | **Still Critical (C2)** |
| Terra broken | **Fixed** (`#1`) |
| Unauth `/update_terms` | **Fixed** (`#3`) |
| Default `ADMIN_TOKEN` | **Fixed** (`#3`) |
| Blind XFF | **Fixed** (`#3`) |
| Open redirect | **Fixed** (`#3`) |
| `subtle` unused | **Partially fixed** — Bearer uses it; Telegram hash still `!=` |
| Health missing | **Partially** — `/health` exists; no `/ready` |
| Terms disclosure all pages | **Partial** — EVM/Terra only |
| Bot fail-open | **Still High (H1)** |
| Property auto-upsert | **Still High (H5)** |

Closed GitLab issues (via `glab`): `#1` Terra, `#2` portal disclosure EVM/Terra, `#3` security ops, `#4` testing (explicitly no Telegram/Solana e2e). **No open issues.**

---

## 7. Database security

| Topic | Assessment |
|-------|------------|
| SQL injection | **Low risk** — parameterized `sqlx` throughout |
| Schema | Sensible FKs/uniques; `signatures` unique on `(property, terms, network, account)` |
| Cascades | Property delete cascades signatures — admin footgun |
| PII / proofs | Wallet addresses, Telegram ids, full messages + proof JSON retained; public status leaks compliance |
| Bot tables | `bot_member_compliance`, `bot_chat_state` — no authz beyond process DB creds |
| Migrations | Applied by API at boot; bot assumes schema exists |
| Leaks | Status API (H6); admin list of all properties; terms content public by design |

---

## 8. Test coverage assessment

### Present (happy / selected bad)

| Layer | Coverage |
|-------|----------|
| API unit | EVM, Solana (envelope-aligned), Terra ADR-036 (incl. abuse), Telegram **widget**, message skew, property normalize, rate-limit/XFF, admin token resolve |
| API integration | EVM multi-property; Terra happy + cross-property replay / tamper / wrong pubkey / skew; `/update_terms` 401 + health + admin list auth |
| SDK Vitest | Message golden, client, URLs, poll happy, TermsGate happy, redirect sanitize |
| Web Vitest | redirect, ui success redirect, query/base58/signShell partial |
| Playwright | Home, property guard, EVM mock wallet, Terra mock Keplr, Telegram “not configured”, Solana disclosure postponed |
| CI | Gitleaks, api+bot clippy/fmt, `cargo test` **api only**, sdk/web unit, e2e with Postgres + explicit `ADMIN_TOKEN` |

### Missing / weak (security-relevant)

| Gap | Impact |
|-----|--------|
| WebApp HMAC golden vector | Missed C1 |
| Solana wallet-realistic e2e / integration | Missed C2 |
| Telegram submit integration (replay across properties) | H3 untested |
| Bot `cargo test` / kick fail-closed / grace reset | H1/H2 untested in CI |
| Property spam, status enumeration, CORS, body limit | Abuse untested |
| E2E redirect abuse / clickjacking / auth failure | Web H3/M12 |
| Terms sync content-change same label / downgrade | H4 |
| Rate-limit memory / proxy spoof under trust | M5/M6 |
| Coverage reporting | None |

### Happy vs bad path summary

| Path | Happy | Bad / abuse |
|------|-------|-------------|
| EVM | Strong | Partial (property scoping yes; fewer HTTP negatives than Terra) |
| Terra | Strong | Strong (integration abuse suite) |
| Solana | Unit only (wrong envelope) | Weak |
| Telegram widget | Unit | Weak at HTTP |
| Telegram WebApp | **Broken** | Untested |
| Admin / update_terms | Integration auth | Good for 401; limited DELETE |
| Bot enforcement | Untested | Untested |
| Redirect | Unit | No e2e evil URI |
| Portal consent Solana/TG | Deferred | Documented gap |

---

## 9. Missing security features (checklist)

- [ ] Fix WebApp HMAC (C1) + Solana envelope alignment (C2)
- [ ] Fail-**closed** bot compliance on API errors; exempt Owner/Administrator
- [ ] Property allowlist / admin registration (stop open upsert)
- [ ] Bind `content_sha256` into acceptance message; sync on hash not only label; monotonic version policy
- [ ] Harden Telegram: shorter auth window, constant-time compare, property-bound consent UX
- [ ] CSP + `frame-ancestors` / `X-Frame-Options`; load Telegram JS only on TG routes
- [ ] `/ready` with DB check; request timeouts; rate-limit bucket TTL
- [ ] Optional auth or coarser status responses to reduce enumeration
- [ ] Redirect `state` parameter; confirm Continue instead of blind auto-navigate
- [ ] SSRF guards on terms fetch (allowlist host, limit redirects, block link-local)
- [ ] Prod defaults: `ALLOW_LOCALHOST_PROPERTY=false`; never ship `CORS_ORIGINS=*`
- [ ] Bot tests in CI; WebApp/Solana e2e; redirect abuse e2e
- [ ] Dependabot/Renovate; remove dead `terms_sync.rs`
- [ ] Signature revocation / audit export (product)

---

## 10. Recommended remediation priority

1. **C1** Fix WebApp secret: `HMAC_SHA256(key=WebAppData, msg=bot_token)` + golden vector from Telegram docs.  
2. **C2** Align Solana: either verify raw UTF-8 (match Phantom) **or** have portal construct the off-chain message bytes wallets actually sign — then add e2e.  
3. **H1/H8** Bot: fail-closed on API errors; skip kicks for admins/creators.  
4. **H9/H10** Separate DB roles (bot limited to `bot_*`); authenticate bot→API reads (mTLS or shared secret).  
5. **H4** Message + sync: include `content_sha256`; republish on hash change; reject version downgrades.  
6. **H5** Property allowlist.  
7. **H7** Consent shell for Solana/Telegram + CSP/framing.  
8. Expand negative tests listed in §8 (incl. lurker / `/chatid` / grace-reset cases).

---

## 11. Positive controls (do not regress)

Documented in `skills/security-ops/SKILL.md` and confirmed in code:

1. `POST /update_terms` requires Bearer; GET removed.  
2. Unattended sync = startup + interval worker.  
3. Single Bearer scheme for admin + update_terms.  
4. `ADMIN_TOKEN` fail-fast vs known default.  
5. Constant-time Bearer compare.  
6. Portal/`sanitizeRedirectUri` allowlist.  
7. XFF untrusted by default; rightmost hop when trusted.  
8. Public `/health` is liveness-only.

Terra ADR-036 invariants: `skills/terra-classic-adr036/SKILL.md`.

---

## 12. Agent / tooling notes

| Worker | Focus |
|--------|-------|
| Composer 2.5 | Rust API auth, rate limit, verify, DB |
| Composer 2.5 | Bot enforcement + DB leaks |
| Composer 2.5 | Web / SDK / e2e |
| Composer 2.5 | Crypto / oracle / economic analogues |
| Composer 2.5 explore | Attack-surface inventory + gap/CI/`glab` |

GitLab accessed via **`glab` CLI** (not MCP). Findings consolidated and independently re-verified against source for C1/C2/H1/H4/H5 and ops controls.

---

*End of internal audit `INTERNAL_COMPOSER_1786408744`.*
