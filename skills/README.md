# Agent skills (third-party / multi-agent)

Skill docs for contributors and external coding agents. Each skill has a `SKILL.md` with invariants and file cross-links.

| Skill | Purpose |
|-------|---------|
| [`terra-classic-adr036`](terra-classic-adr036/SKILL.md) | Terra Classic Keplr `signArbitrary` + API ADR-036 verify (`columbus-5`) |
| [`security-ops`](security-ops/SKILL.md) | Auth `/update_terms`, ADMIN_TOKEN fail-fast, redirect allowlist, trusted XFF |
| [`portal-sign-disclosure`](portal-sign-disclosure/SKILL.md) | On-page terms + consent gate on EVM/Terra Classic sign pages (GitLab #2) |
| [`testing-coverage`](testing-coverage/SKILL.md) | EVM / Terra / portal test layers, CI, e2e invariants (GitLab #4) |
| [`bot-enforcement`](bot-enforcement/SKILL.md) | Telegram bot fail-closed compliance / kick invariants (GitLab #5) |

Product overview: [`../README.md`](../README.md). Gap analysis: [`../gaps/GAP_1786322222.md`](../gaps/GAP_1786322222.md).
