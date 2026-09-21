# Architecture overview

CL8Y Legal is the Terms & Conditions signing platform for the CL8Y
ecosystem: one global terms version, **per-property** acceptance, a public
API for dapps, a signing portal, and a Telegram enforcement bot.

Product behavior, wallet matrices, and operator knobs stay in
[`README.md`](../README.md) and [`skills/`](../skills/README.md). This file
is the short map. Merge-gate decision:
[ADR 0001](adr/0001-remove-catchall-codeowners.md).

## Components

```
  integrators / dapps          browsers / wallets           Telegram
           |                          |                         |
           v                          v                         v
  @plasticdigits/cl8y-clickwrap   web/ (Vite portal)      bot/ (Rust)
           |                          |                         |
           +------------+-------------+------------+------------+
                        |
                        v
                 api/ (Rust + Postgres)
                        ^
                        |
              TERMS_AND_CONDITIONS.txt
              (content-hash terms oracle)
```

| Piece | Role |
|-------|------|
| `api/` | Canonical terms, signatures, admin property register, verify (EVM / Terra Classic ADR-036 / Solana / Telegram). Production: `api.terms.cl8y.com`. |
| `web/` | Signing UI (`/sign/evm`, `/sign/terra-classic`, `/sign/solana`, `/sign/telegram`). Production: `terms.cl8y.com`. |
| `packages/cl8y-clickwrap` | Integrator client, poll helpers, `TermsGate`. |
| `bot/` | Allowed-supergroup reminders and kicks; fail-closed when status is unknown. |
| Postgres | Terms versions, properties, signatures, bot compliance tables. |

Acceptance is one row per `(property, terms version, network, account)`.
Signing on `cl8y.com` does not satisfy `yieldomega.com`.

## Merge gate (Forgejo `main`)

Protected `main` is **not** CODEOWNERS. The standing gate is Forgejo branch
protection owned by [cl8y-forgejo#48](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/issues/48)
(still **open** pending product AC5 deletes) /
[docs/INVARIANTS.md](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/src/branch/main/docs/INVARIANTS.md).
[cl8y-forgejo#50](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/issues/50)
merged the forge policy/protection rollout; it did not close #48.

- no direct push (`enable_push: false`)
- required status `ci/woodpecker/pr/woodpecker`
- `required_approvals: 0`
- `block_on_official_review_requests: false`
- `block_on_rejected_reviews: true`
- never `force_merge`

Forgejo loads CODEOWNERS from the default branch
(`CODEOWNERS`, `docs/CODEOWNERS`, `.gitea/CODEOWNERS`,
`.forgejo/CODEOWNERS`) and plants official review requests for files
changed from merge-base to head. [ADR 0001](adr/0001-remove-catchall-codeowners.md)
deletes the catch-all (`.* @code/maintainers`). Plants continue while
that file remains on `main`. Re-adding CODEOWNERS in a later PR does
not restore the official-review **block** (protection PATCH is
admin-only). CAC still requires tip `RECOMMEND: ACCEPT` plus green
Woodpecker; that controller policy is not implemented here
([cl8y-agent-control#429](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/issues/429)).

`.gitlab-ci.yml` is a GitLab leftover. Absence of `.woodpecker.yaml` in
this tree does not change the required Forgejo context; adding Woodpecker
YAML is a separate CI slice, not ADR 0001. Org #48 AC5 for this repo is
catch-all gone from `main`. Missing `ci/woodpecker/pr/woodpecker` is that
land gate, not a reason to add YAML here. See
[ADR 0001](adr/0001-remove-catchall-codeowners.md).

## Invariants (product)

Coded in skills, not duplicated here:

| Area | Skill |
|------|-------|
| Terra Classic ADR-036 + wallet matrix | [`terra-classic-adr036`](../skills/terra-classic-adr036/SKILL.md) |
| Admin / terms oracle / XFF / `ADMIN_TOKEN` | [`security-ops`](../skills/security-ops/SKILL.md) |
| Portal disclosure + consent | [`portal-sign-disclosure`](../skills/portal-sign-disclosure/SKILL.md) |
| Test layers | [`testing-coverage`](../skills/testing-coverage/SKILL.md) |
| Bot fail-closed compliance | [`bot-enforcement`](../skills/bot-enforcement/SKILL.md) |
| Solana `account=` bind | [`solana-account-bind`](../skills/solana-account-bind/SKILL.md) |
