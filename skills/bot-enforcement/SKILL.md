---
name: bot-enforcement
description: >-
  Telegram terms bot fail-closed compliance and kick invariants (GitLab #5).
  Use when changing bot Legal API status checks, mark_non_compliant, run_kicks,
  announce_terms_update, or bot CI cargo test. Never coerce API Err to unsigned.
---

# Bot enforcement (fail-closed compliance)

**Issue:** GitLab [#5](https://gitlab.com/plasticdigits/cl8y-ecosystem-legal/-/issues/5) — Bot: fail-closed compliance when Legal API errors

Tracked from audit H1 in [`audits/INTERNAL_COMPOSER_1786408744.md`](../../audits/INTERNAL_COMPOSER_1786408744.md) and [`gaps/GAP_1786322222.md`](../../gaps/GAP_1786322222.md).

## Invariants (do not regress)

1. **Never coerce API errors to unsigned.** No `unwrap_or(false)` (or equivalent) on `is_signed_latest` / status in enforcement or kick paths.
2. **Unknown → hold.** On `Err` (timeout, 5xx, 429, parse failure), do **not** call `mark_non_compliant` and do **not** `ban_chat_member`.
3. **Explicit true clears; explicit false marks.** `Ok(true)` → `clear_compliant`; `Ok(false)` → `mark_non_compliant` (existing grace / overdue kick semantics).
4. **Central classification.** Use [`bot/src/compliance.rs`](../../bot/src/compliance.rs) (`ComplianceCheck` / `classify_status`) from `handle_group_message`, `announce_terms_update`, `run_kicks`, and `handle_member_joined`.
5. **Structured logs on Unknown.** `warn` with `chat_id`, `user_id`, `error`, and `context` — visible to ops without inventing punishment.
6. **Allowlist unchanged.** Kick / mark paths still require `config.is_allowed_chat`; do not broaden privileges.
7. **CI runs bot tests.** `.gitlab-ci.yml` job `test:rust-bot` → `cd bot && cargo test`.

## Policy matrix

| Status | DB | Kick |
|--------|----|------|
| `SignedLatest` | `clear_compliant` | no |
| `NotSignedLatest` | `mark_non_compliant` | only if overdue + active member |
| `Unknown` | untouched | **no** |

## Key files

| Concern | Path |
|---------|------|
| Classification + unit tests | `bot/src/compliance.rs` |
| Call sites | `bot/src/enforcement.rs` |
| Legal API HTTP | `bot/src/api_client.rs` |
| Compliance DB | `bot/src/db.rs` |
| Scheduler ticks | `bot/src/scheduler.rs` |
| Product docs | [`README.md`](../../README.md#telegram-enforcement-bot-cl8ytermsbot) |
| CI | [`.gitlab-ci.yml`](../../.gitlab-ci.yml) (`test:rust-bot`, `lint:rust-bot`) |

## Agent checklist

- [ ] New status consumers use `classify_status` / `ComplianceCheck` — never `unwrap_or(false)`.
- [ ] Kick paths call `may_kick()` or match only `NotSignedLatest` before `ban_chat_member`.
- [ ] Unit tests cover Signed / NotSigned / Unknown outcomes (`cargo test` in `bot/`).
- [ ] README or this skill updated if the policy matrix changes.
- [ ] Related portal/API security stays in [`skills/security-ops/SKILL.md`](../security-ops/SKILL.md); bot kick semantics stay here.

## Out of scope (file separately)

Grace reset on rejoin, admin/creator kick exemption, lurker tracking, property upsert, Telegram WebApp crypto HMAC, authenticated bot→API channel, circuit breaker / API-healthy flag (optional hardening beyond #5 MVP).
