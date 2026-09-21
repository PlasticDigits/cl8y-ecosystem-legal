# ADR 0001: Remove catch-all CODEOWNERS

Status: **Proposed** — not architecture approval. Keywords in
[#37](https://git.cl8y.com/code/cl8y-ecosystem-legal/issues/37) are not
approval. Ordinary design is not a founder card. This slice does not
deploy `terms.cl8y.com` / `api.terms.cl8y.com`, rotate `ADMIN_TOKEN`,
or expand CAC deploy/spend/custody policy under
[#297](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/issues/297)
/ agent-control [ADR 0004](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/src/branch/main/docs/adr/0004-autonomy-policy.md).

Date: 2026-09-21

Overview (do not duplicate): [`architecture.md`](../architecture.md#merge-gate-forgejo-main).
Org policy (do not re-implement here):
[cl8y-forgejo#48](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/issues/48),
landed as [cl8y-forgejo#50](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/issues/50),
[cl8y-forgejo docs/INVARIANTS.md](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/src/branch/main/docs/INVARIANTS.md).

No same-repo issue dependencies. Sister CAC
[#429](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/issues/429)
and closed [#388](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/issues/388)
are controller contracts this tree does not edit. Drain must not delete
`CODEOWNERS` as a merge workaround; this designed PR is the allowed
product-tree path (forgejo invariant 8: delete via PR, never direct
`main`).

## Outcome

This repository no longer plants official Forgejo review requests on
every change. Root [`CODEOWNERS`](../../CODEOWNERS) (`.* @code/maintainers`)
is deleted. Copies at `docs/CODEOWNERS` and `.forgejo/CODEOWNERS` stay
absent.

Merge into `main` still requires a pull request (no direct push), live
status `ci/woodpecker/pr/woodpecker`, SHA-pinned `Do: merge`, and never
`force_merge`. Official CODEOWNERS review is not a merge gate.

## Context

Forgejo CODEOWNERS is Go-regexp, not GitHub globs. The file added in
`30c0bfc` matches every path:

```
.* @code/maintainers
```

Forgejo then requests official review from team `@code/maintainers` on
each PR. With a one-person maintainers team, the author cannot approve
their own pull (422). If `block_on_official_review_requests` is true,
merge POST returns 405. CAC `RECOMMEND: ACCEPT` is not a Forgejo
`APPROVED` review. Grouped drain classifies that as
`DrainSkip::OfficialReview` and does **not** dismiss reviewers, delete
`CODEOWNERS`, or `force_merge` ([#388](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/issues/388)).

cl8y-forgejo#50 already rolled protection on reachable `code/*` and
`PlasticDigits/*` repos: `block_on_official_review_requests: false`,
`required_approvals: 0`, `enable_push: false`, required context
`ci/woodpecker/pr/woodpecker`. Observed GET for this repo (2026-09-21)
matches that contract. Migrate / `apply_repo_policy.py` no longer plant
CODEOWNERS.

The remaining defect in **this** tree is the catch-all file itself.
Occupying [#37](https://git.cl8y.com/code/cl8y-ecosystem-legal/pulls/37)
(`chore/remove-catchall-codeowners`, `82c5959`) already deletes it.
That PR opened while the file was on `main`, so Forgejo already planted
an official `REQUEST_REVIEW` from `@code/maintainers` on the PR. With
protection `block_on_official_review_requests=false`, that leftover
request is not a merge block. New PRs after the file is gone must not
get a new official request from this catch-all.

This repo has `.gitlab-ci.yml` (GitLab leftover) and **no**
`.woodpecker.yaml`. The required Forgejo context can therefore be
missing until a separate CI slice adds Woodpecker. That gap is not
introduced by deleting CODEOWNERS and is not solved here.

## Non-goals

- PATCH Forgejo branch protection from this repository (admin-only;
  already rolled by cl8y-forgejo#50).
- Add, port, or fake `.woodpecker.yaml` / commit statuses.
- Delete or rewrite `.gitlab-ci.yml`.
- Change `api/`, `web/`, `bot/`, clickwrap, terms oracle, or Coolify
  deploy of `terms.cl8y.com`.
- Dismiss reviewers, `force_merge`, enable direct `main`, drop
  `ci/woodpecker/pr/woodpecker`, or set `enable_push: true`.
- Restore `required_approvals: 1` or `block_on_official_review_requests`.
- Path-specific CODEOWNERS as a substitute catch-all.
- Edit `cl8y-agent-control` (`autonomy.rs`, HMAC, `DrainSkip::OfficialReview`).
- File a founder / `cac-merge-*` card for this ordinary chore.
- Community autoland or fork CI.

## Decision

**Delete the catch-all file. Do not replace it.** Merge authority stays
on Forgejo protection + Woodpecker PR context + (for CAC) tip ACCEPT.
Humans are not pinged by `.* @code/maintainers`.

Keep `block_on_rejected_reviews` (explicit REJECT still blocks). A later
PR that re-adds CODEOWNERS plants requests again but does **not** restore
the official-review merge **block** unless an admin PATCHes protection
(forgejo invariant 9).

Implement lands the file delete on a PR that also preserves this ADR
(agent-control ADR 0005: implementation starts from the approved design
commit). Occupying #37 already has the delete; it is not a second
product change.

## Component / state / interface changes

| Layer | Change |
|-------|--------|
| Git tree | Delete root `CODEOWNERS`. Do not add `docs/CODEOWNERS` or `.forgejo/CODEOWNERS`. |
| Docs | This ADR + merge-gate section in [`architecture.md`](../architecture.md). Product skills unchanged. |
| HTTP / DB / wallets | None. |
| Forgejo protection JSON | Out of tree. Do not PATCH from implement. |
| CAC | None. After the file is gone, new tips should stop entering official-review leftover; controller cleanup is optional on agent-control. |

No schema, env keys, or public API.

## Affected invariants

| ID | Effect |
|----|--------|
| cl8y-forgejo invariants 2–8 | This slice is the product-tree half of 5+8 (delete catch-all via PR). Protection flags stay 2–7. |
| cl8y-forgejo 9 | Re-adding CODEOWNERS in a later PR is not a merge-block restore. |
| CAC 29 / 67 / #388 | Drain still must not dismiss reviewers or delete CODEOWNERS as a workaround. This PR is the designed delete. `OfficialReview` skip remains valid if some other repo still deadlocks. |
| CAC 57 (missing Woodpecker YAML) | Unchanged. Do not treat CODEOWNERS removal as CI enablement. |
| Product skills (ADR-036, oracle, bot, portal) | Unchanged. |

## Alternatives

| Option | Why not |
|--------|---------|
| Keep file; operators dismiss the self-request | Status quo. Deadlocks CAC. Forbidden as drain behavior (#388). |
| Path-specific owners (`api/`, `web/`) | Still plants official requests on those paths; one-person team still cannot self-approve if official-review block returns. |
| `required_approvals: 1` without CODEOWNERS | Same one-person deadlock. Already 0 on this repo. |
| Protection-only (keep file) | File still plants official `REQUEST_REVIEW` on every PR (noise, leftover class, confusion with a merge gate). Forgejo invariant 5: do both. |
| Direct push delete to `main` | Violates `enable_push: false`. |
| `force_merge` | Forbidden. |
| Wait for Woodpecker YAML first | Orthogonal. Missing CI already blocks the required context; CODEOWNERS is a different plant. |

## Complexity added / removed

**Removed:** catch-all official-review plant on every PR; operator dismiss
step for this repo’s self-request deadlock.

**Added:** first repo-native ADR + architecture overview (docs only).

Net: one six-line process file gone; no new runtime surface.

## Migration

1. Land this ADR + `docs/architecture.md` on `cac-design-issue-37` (design
   transport only; not a design-only product PR).
2. Implement from the approved design commit: delete root `CODEOWNERS`
   (same diff as `82c5959`), keep these docs, open/update the occupying
   PR against `main`. Never push `main` directly.
3. Open PRs created while the file existed may keep a leftover official
   request. With current protection that is not a 405. Do not dismiss
   reviewers as part of this slice.
4. No database, Coolify, or npm publish.

Idempotent: a second delete is a no-op if the file is already gone.

## Observability

- New PRs: reviews list has no official team `REQUEST_REVIEW` from
  `@code/maintainers` caused by this file.
- Occupying #37: may still show the request planted at open; merge POST
  must not 405 solely for that request given current protection.
- CAC drain skip comment `official CODEOWNERS review deadlock after
  ACCEPT+green` should stop appearing for **new** tips of this repo.
  Existing skip on #37 (`no occupying job…`) is a different class.
- No application logs, metrics, or `/health` change.

## Failure modes

| Mode | Behavior |
|------|----------|
| File deleted, leftover official request on an already-open PR | Not a merge block while `block_on_official_review_requests` is false. Do not `force_merge`. |
| Protection later PATCHed back to official-review true | New plants need a CODEOWNERS file; leftover requests plus that flag can 405 again. Repair is forgejo policy, not a Legal app change. |
| Catch-all re-added at root / `docs/` / `.forgejo/` | Plants requests again. Implement check must fail if any of those paths contain a `.*` owner rule. Does not by itself restore the merge **block**. |
| Missing `ci/woodpecker/pr/woodpecker` on the tip | Merge stays blocked on the required status (existing). Do not fake the context. |
| Operator uses `force_merge` to land #37 | Forbidden. |
| Scope creep into Woodpecker YAML / GitLab CI port | Out of this ADR; reject in review. |
| Community PR adds CODEOWNERS to “restore review” | Still not a merge gate unless admin PATCHes protection. |
| This slice PATCHes `enable_push: true` | Fail. Unprotected `main`. |

## Ordered implementation slices

1. **Design (this commit)** — ADR 0001 + architecture merge-gate section.
2. **Delete catch-all** — remove root `CODEOWNERS`; confirm no
   `docs/CODEOWNERS` or `.forgejo/CODEOWNERS`. Preserve slice 1 in the
   implement PR.
3. **Verify** — `git ls-files` has no CODEOWNERS; docs still state the
   remaining merge gate; product tests not required to change.
4. **Not this issue** — Woodpecker YAML; GitLab CI removal; CAC autoland
   predicate; Coolify deploy; dex/hello sibling CODEOWNERS PRs.

**Open same-repo issue dependencies:** none.

**Cross-repo (context, not `DEPS`):** cl8y-forgejo#48/#50 already
shipped protection + “do not plant”; this issue is that rollout’s
per-repo AC5 for `code/cl8y-ecosystem-legal`.

## Tests

No runtime tests. Product `cargo test` / Vitest / Playwright stay
green without edits.

| ID | Check | Expect |
|----|--------|--------|
| T1 | `git ls-files '*CODEOWNERS' '.forgejo/CODEOWNERS' 'docs/CODEOWNERS'` after implement | Empty |
| T2 | `rg -n '^\\.\\*\\s+@' CODEOWNERS docs/CODEOWNERS .forgejo/CODEOWNERS` | No files / no matches |
| T3 | Docs grep in `docs/architecture.md` + this ADR | Remaining gate named: no direct `main`, `ci/woodpecker/pr/woodpecker`, no `force_merge` |
| T4 | Diff vs `main` | No `api/`, `web/`, `bot/`, or package source changes |
| T5 | Protection GET (operator glance, not a merge-required unit test) | `enable_push=false`, official-review false, approvals 0, status context unchanged. Implement must not PATCH even if drift is seen — report, do not “fix” from this repo. |

Do not add a live Forgejo API test to CI (token + network). Do not POST
synthetic commit statuses.

## Rollout

1. Design review of this revision (independent job). This document is
   not approval.
2. Implement PR: design files + CODEOWNERS delete, targeting `main`.
3. Wait for required `ci/woodpecker/pr/woodpecker` on the implement tip
   (may stay pending until a Woodpecker YAML exists — that wait is CI,
   not a reason to `force_merge` or skip this delete).
4. Merge with `Do: merge` / SHA pin. Never `force_merge`.
5. Confirm a subsequent PR does not auto-request `@code/maintainers`.

No frontend rebuild. No API restart. No npm publish.

## Rollback

Restore the previous `CODEOWNERS` blob via a **new PR** (same six lines).
Do not direct-push `main`. Do not flip protection flags from this repo
as part of rollback. Re-planting the catch-all restores request noise;
it does not by itself restore official-review merge block.

Revert of this ADR alone without restoring the file leaves the tree in
the desired product state (no catch-all) with weaker docs — acceptable
only as a docs revert, not as a merge-gate rollback.

## Integration completion criteria

Done when:

1. `main` has no catch-all CODEOWNERS at the three Forgejo locations.
2. `docs/architecture.md` still states the remaining merge gate.
3. Implement diff does not change product runtime.
4. Merge of the implement PR did not use `force_merge` and did not
   dismiss reviewers as a substitute for the delete.
5. Branch protection was not PATCHed by this slice.

Not done when: Woodpecker is still missing, GitLab CI still exists, or
CAC #429 is unmerged. Those are other tickets.
