# ADR 0001: Remove catch-all CODEOWNERS

Status: **Proposed** — not architecture approval. Keywords in
[#37](https://git.cl8y.com/code/cl8y-ecosystem-legal/issues/37) are not
approval. Ordinary design is not a founder card. This slice does not
deploy `terms.cl8y.com` / `api.terms.cl8y.com`, rotate `ADMIN_TOKEN`,
or expand CAC deploy/spend/custody policy under
[#297](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/issues/297)
/ agent-control [ADR 0004](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/src/branch/main/docs/adr/0004-autonomy-policy.md).

Date: 2026-09-21 (revised same day).

Overview (do not duplicate): [`architecture.md`](../architecture.md#merge-gate-forgejo-main).
Org policy (do not re-implement here):
[cl8y-forgejo#48](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/issues/48)
(still **open** — product AC5 deletes pending),
[cl8y-forgejo#50](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/issues/50)
(merged: forge policy + protection rollout on the ops tree),
[cl8y-forgejo docs/INVARIANTS.md](https://git.cl8y.com/PlasticDigits/cl8y-forgejo/src/branch/main/docs/INVARIANTS.md).

No same-repo issue dependencies. Sister CAC
[#429](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/issues/429)
and closed [#388](https://git.cl8y.com/PlasticDigits/cl8y-agent-control/issues/388)
are controller contracts this tree does not edit. Drain must not delete
`CODEOWNERS` as a merge workaround; this designed PR is the allowed
product-tree path (forgejo invariant 8: delete via PR, never direct
`main`).

## Outcome

**Target after slice 2** (false at this design SHA): this repository no
longer plants official Forgejo review requests on every change. Root
`CODEOWNERS` (`.* @code/maintainers`) is deleted. Copies at
`docs/CODEOWNERS` and `.forgejo/CODEOWNERS` stay absent.

Until slice 2, the six-line catch-all remains on this design tip and on
`main`. The path `CODEOWNERS` at repo root is the file implement deletes;
do not read this ADR’s mention of it as “already gone.”

Merge into `main` still requires a pull request (no direct push), live
status `ci/woodpecker/pr/woodpecker`, SHA-pinned `Do: merge`, and never
`force_merge`. Official CODEOWNERS review is not a merge gate.

**Implement success** is a reachable PR tip, not a `main` land. See
Integration completion. Waiting on Woodpecker is the land gate, not an
implement defect, and is not a reason to grow [#37](https://git.cl8y.com/code/cl8y-ecosystem-legal/issues/37)
into CI.

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

cl8y-forgejo#50 merged the forge policy/protection rollout
(templates, `apply_repo_policy.py` / migrate no longer plant CODEOWNERS,
protection JSON on reachable `code/*` and `PlasticDigits/*`). Observed
GET for this repo (2026-09-21, authenticated) matches that contract:
`enable_push: false`, `required_approvals: 0`,
`block_on_official_review_requests: false`,
`block_on_rejected_reviews: true`, required context
`ci/woodpecker/pr/woodpecker`. Anonymous GET is 401. If live flags
differ, report to forge owners; do not PATCH from this repo.

Issue #48 remains **open**. #50 did not close it. AC5 is leftover
product `chore/remove-catchall-codeowners` PRs (canary
[code/hello#15](https://git.cl8y.com/code/hello/pulls/15)). This ticket
is Legal’s product-tree half of that AC5, not a second protection
rollout.

The remaining defect in **this** tree is the catch-all file itself.
Occupying [#37](https://git.cl8y.com/code/cl8y-ecosystem-legal/pulls/37)
(`chore/remove-catchall-codeowners`, `82c5959`) already deletes it and
**nothing else**. `fdfbf15` (this ADR’s first publish) and `82c5959` are
siblings under merge-base `30c0bfc`. Neither is an ancestor of the
other. **Do not merge `82c5959`.** That tip has no ADR /
`architecture.md`. Implement updates the occupying branch to a **new**
tip = independently accepted design SHA + the root delete (see Decision
and Migration).

That PR opened while the file was on `main`, so Forgejo already planted
an official `REQUEST_REVIEW` from team `maintainers` (review id 198,
`official: true`). With protection
`block_on_official_review_requests=false`, that leftover is not a 405.
Do not dismiss it. New PRs after the file is gone must not get a new
official request from this catch-all.

This repo has `.gitlab-ci.yml` (GitLab leftover) and **no**
`.woodpecker.yaml` / `.woodpecker.yml`. Open same-repo set (2026-09-21):
[#37](https://git.cl8y.com/code/cl8y-ecosystem-legal/issues/37) (this
chore; occupying PR), [#36](https://git.cl8y.com/code/cl8y-ecosystem-legal/pulls/36)
(Renovate), and unrelated product issues #35 / #34 / #14 / #7. There is
**no** Legal ticket to add Woodpecker. Tips `82c5959`, `fdfbf15`, and
`main` `30c0bfc` have zero commit statuses. Protection still requires
`ci/woodpecker/pr/woodpecker`. This ADR does not file that CI ticket,
does not add YAML, and does not POST fake statuses. Org AC5 for this
repo (file gone from `main`) stays open until that context exists and
the implement PR merges. A still-on-`main` CODEOWNERS after implement
success is that wait, not an implement failure.

## Non-goals

- PATCH Forgejo branch protection from this repository (admin-only;
  already rolled by cl8y-forgejo#50).
- Add, port, or fake `.woodpecker.yaml` / `.woodpecker.yml` / commit
  statuses. Do not solve the CI gap in this ADR.
- Delete or rewrite `.gitlab-ci.yml`.
- Change `api/`, `web/`, `bot/`, clickwrap, terms oracle, or Coolify
  deploy of `terms.cl8y.com`.
- Dismiss reviewers, `force_merge`, enable direct `main`, drop
  `ci/woodpecker/pr/woodpecker`, or set `enable_push: true`.
- Restore `required_approvals: 1` or `block_on_official_review_requests`.
- Path-specific CODEOWNERS as a substitute catch-all.
- Edit `cl8y-agent-control` (`autonomy.rs`, HMAC, `DrainSkip::OfficialReview`).
- File a founder / `cac-merge-*` card for this ordinary chore.
- Open a second product PR besides occupying #37.
- Merge occupying tip `82c5959` as-is.
- Community autoland or fork CI.

## Decision

**Delete the catch-all file. Do not replace it.** Merge authority stays
on Forgejo protection + Woodpecker PR context + (for CAC) tip ACCEPT.
Humans are not pinged by `.* @code/maintainers`.

Keep `block_on_rejected_reviews` (explicit REJECT still blocks). A later
PR that re-adds CODEOWNERS plants requests again but does **not** restore
the official-review merge **block** unless an admin PATCHes protection
(forgejo invariant 9).

### Implement tip (occupying #37)

Issue #37 **is** pull #37. Update
`chore/remove-catchall-codeowners` to a **new** tip:

1. Independently accepted design commit (`fdfbf15`, or the successor
   SHA on `cac-design-issue-37` that independent review accepts).
2. Plus delete of root `CODEOWNERS` (same six-line blob `82c5959`
   removes; do not take `82c5959` itself).
3. Preserve this ADR and [`architecture.md`](../architecture.md)
   byte-identical to that accepted design SHA.

Do **not** merge `82c5959`. Do **not** open a second product PR. Do
**not** merge `cac-design-issue-37` to `main` (design transport only;
it still carries root `CODEOWNERS` until slice 2). Leftover official
request 198 may remain; do not dismiss.

Occupying #37 already has a delete-only commit. That is **not** “merge
the occupying tip.” It is the blob to replay onto the design SHA.

## Component / state / interface changes

| Layer | Change |
|-------|--------|
| Git tree | **Slice 2:** delete root `CODEOWNERS`. Do not add `docs/CODEOWNERS` or `.forgejo/CODEOWNERS`. Not done at this design SHA. |
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
| Merge occupying `82c5959` | Drops this ADR and `architecture.md`. Incomplete land. |
| Wait for Woodpecker YAML first, then treat that wait as implement | Orthogonal plant. Missing CI already blocks the required context; CODEOWNERS is a different file. This ADR does not add YAML. Implement success does not wait on that context. |
| File a Legal Woodpecker issue from this ADR | Out of this slice. Org AC5 for `main` stays open until a later CI ticket posts the context; that wait is not `DEPS` for implement. |

## Complexity added / removed

**Removed (after slice 2):** catch-all official-review plant on every
PR; operator dismiss step for this repo’s self-request deadlock.

**Added:** first repo-native ADR + architecture overview (docs only).

Net: one six-line process file gone; no new runtime surface. No new CI
workflow.

## Migration

1. Land this ADR + `docs/architecture.md` on `cac-design-issue-37` (design
   transport only; not a design-only product PR).
2. Implement from the independently accepted design commit: on occupying
   `chore/remove-catchall-codeowners` / PR #37, produce a **new** tip =
   that SHA + delete root `CODEOWNERS`. Keep these docs. Never push
   `main` directly. Never merge `82c5959`. Never open a second product
   PR.
3. Open PRs created while the file existed (including #37) may keep a
   leftover official request (review 198). With current protection that
   is not a 405. Do not dismiss reviewers as part of this slice.
4. No database, Coolify, or npm publish. No Woodpecker YAML.

Idempotent: a second delete is a no-op if the file is already gone on
that tip.

## Observability

- New PRs **opened after land**: reviews list has no official team
  `REQUEST_REVIEW` from `maintainers` caused by this file. Occupying #37
  is not that oracle.
- Occupying #37: may still show request 198 planted at open; merge POST
  must not 405 solely for that request given current protection.
- CAC drain skip comment `official CODEOWNERS review deadlock after
  ACCEPT+green` should stop appearing for **new** tips of this repo.
  Existing skip on #37 (`no occupying job…`) is a different class.
- No application logs, metrics, or `/health` change.
- Zero commit statuses on this repo today is expected until a later CI
  ticket. Do not treat that as a CODEOWNERS-delete regression.

## Failure modes

| Mode | Behavior |
|------|----------|
| File deleted, leftover official request on an already-open PR | Not a merge block while `block_on_official_review_requests` is false. Do not `force_merge`. Do not dismiss. |
| Protection later PATCHed back to official-review true | New plants need a CODEOWNERS file; leftover requests plus that flag can 405 again. Repair is forgejo policy, not a Legal app change. |
| Catch-all re-added at root / `docs/` / `.forgejo/` | Plants requests again. Implement / regression check must fail using the **T2 recipe** (tracked blobs only). Does not by itself restore the merge **block**. |
| Mechanical check `rg`s missing `CODEOWNERS` / `docs/CODEOWNERS` / `.forgejo/CODEOWNERS` | `rg` exit 2 (`No such file or directory`) is **not** “no matches.” A correct delete would fail that command. Use T1/T2 below. |
| Merge `82c5959` | Design docs dropped. Reject. Replay the delete onto the accepted design SHA. |
| Missing `ci/woodpecker/pr/woodpecker` on the tip | Merge stays blocked on the required status (existing). Do not fake the context. Do not treat that wait as implement failure. Do not grow #37 into YAML. |
| Operator uses `force_merge` to land #37 | Forbidden. |
| Scope creep into Woodpecker YAML / GitLab CI port | Out of this ADR; reject in review. |
| Community PR adds CODEOWNERS to “restore review” | Still not a merge gate unless admin PATCHes protection. |
| This slice PATCHes `enable_push: true` | Fail. Unprotected `main`. |
| Drain treats “wait, then `Do: merge`” as this issue’s only done | Wrong. Implement success is the PR tip (below). Land is a later merge predecessor. |

## Ordered implementation slices

1. **Design (this commit)** — ADR 0001 + architecture merge-gate section.
   Root `CODEOWNERS` still present on this tip.
2. **Delete catch-all** — on occupying PR #37 / `chore/remove-catchall-codeowners`,
   new tip = accepted design SHA + remove root `CODEOWNERS`; confirm no
   `docs/CODEOWNERS` or `.forgejo/CODEOWNERS`. Preserve slice 1 in that
   PR. Do not merge `82c5959`. Do not open a second product PR.
3. **Verify** — T1/T2/T3/T4 on that tip (commands in Tests). Product
   tests not required to change.
4. **Not this issue** — Woodpecker YAML; GitLab CI removal; CAC autoland
   predicate; Coolify deploy; dex/hello sibling CODEOWNERS PRs.

Slice 2+3 = **implement success**. Land on `main` is not a slice of this
issue; it stays gated by the existing required status.

**Open same-repo issue dependencies:** none.

**Cross-repo (context, not `DEPS`):** cl8y-forgejo#50 shipped protection
+ “do not plant” on the ops tree; #48 is still open pending product AC5.
This issue is that rollout’s per-repo AC5 for
`code/cl8y-ecosystem-legal` once the delete is on `main`.

## Tests

No runtime tests. Product `cargo test` / Vitest / Playwright stay
green without edits. Do not add Woodpecker for these checks. Do not
`rg` literal missing paths.

Pasteable (repo root). Do not treat ripgrep exit 2 as “no matches.”

**T1 — no tracked CODEOWNERS** (owns “file gone” for this slice):

```bash
# Pass iff empty.
git ls-files -- '*CODEOWNERS'
```

**T2 — no catch-all owner rule in any remaining tracked CODEOWNERS
blob.** T1 empty is T2 pass. If any paths remain, fail only when those
blobs match `^\.\*[[:space:]]+@`. Search those blobs only:

```bash
tracked=$(git ls-files -- '*CODEOWNERS')
if [ -z "$tracked" ]; then
  echo 'T2 pass: no tracked CODEOWNERS'
else
  # git grep only the tracked pathspecs. Do not pass missing
  # CODEOWNERS / docs/CODEOWNERS / .forgejo/CODEOWNERS to rg.
  if git ls-files -z -- '*CODEOWNERS' \
       | xargs -0 git grep -n -E '^\.\*[[:space:]]+@' --
  then
    echo 'T2 fail: catch-all owner rule in a tracked CODEOWNERS'
    exit 1
  fi
  echo 'T2 pass: remaining CODEOWNERS have no catch-all rule'
fi
```

Expect after slice 2: T1 empty, T2 first branch (“no tracked
CODEOWNERS”). The failure-mode “re-added `.*` owner rule” uses this
same recipe, not `rg CODEOWNERS docs/CODEOWNERS .forgejo/CODEOWNERS`.

| ID | Check | Expect |
|----|--------|--------|
| T1 | `git ls-files -- '*CODEOWNERS'` after implement | Empty |
| T2 | Recipe above (tracked blobs only) | Pass (empty set, or no `^\.\*[[:space:]]+@` in remaining blobs) |
| T3 | Docs grep in `docs/architecture.md` + this ADR | Remaining gate named: no direct `main`, `ci/woodpecker/pr/woodpecker`, no `force_merge` |
| T4 | Diff vs `main` | No `api/`, `web/`, `bot/`, or package source changes |
| T5 | Protection GET (operator glance, not a merge-required unit test) | `enable_push=false`, official-review false, approvals 0, status context unchanged. Implement must not PATCH even if drift is seen — report, do not “fix” from this repo. |

Do not add a live Forgejo API test to CI (token + network). Do not POST
synthetic commit statuses.

## Rollout

1. Design review of this revision (independent job). This document is
   not approval. `cac-design-issue-37` stays unpublished as a product PR.
2. **Implement:** update occupying PR #37 to accepted design SHA +
   CODEOWNERS delete. Docs preserved. T1/T3/T4 green; T2 via the
   tracked-blob recipe. Product runtime untouched. Leftover request 198
   may remain. **Implement success is this tip**, even while `main`
   still has the file and even while Woodpecker is missing.
3. **Land on `main`:** stays gated by existing required
   `ci/woodpecker/pr/woodpecker`. That wait is not an implement defect
   and is not a reason to add YAML, POST fake statuses, or
   `force_merge`. Org #48 AC5 for this repo stays open until that
   context exists and #37 merges. This ADR does not file the CI ticket.
4. When the required context is green: merge with `Do: merge` / SHA
   pin. Never `force_merge`. Never dismiss reviewers as a substitute.
5. Confirm a **subsequent** PR (opened after land) does not auto-request
   team `maintainers`. Occupying #37’s leftover is not that proof.

No frontend rebuild. No API restart. No npm publish.

CAC drain / implement must record the new tip SHA as this issue’s
reachable done. They must not treat “wait, then `Do: merge`” as the
only completion criterion.

## Rollback

Restore the previous `CODEOWNERS` blob via a **new PR** (same six lines).
Do not direct-push `main`. Do not flip protection flags from this repo
as part of rollback. Re-planting the catch-all restores request noise;
it does not by itself restore official-review merge block.

Revert of this ADR alone without restoring the file leaves the tree in
the desired product state (no catch-all) with weaker docs — acceptable
only as a docs revert, not as a merge-gate rollback.

## Integration completion criteria

### Implement success (reachable without CI or `force_merge`)

Done when occupying PR #37’s tip is:

1. The independently accepted design commit plus the root `CODEOWNERS`
   delete (not `82c5959` as-is; not a second product PR).
2. This ADR and `docs/architecture.md` preserved from that design SHA.
3. T1 empty, T2 pass via the tracked-blob recipe, T3 names the remaining
   gate, T4 has no `api/` `web/` `bot/` / package source changes.
4. Product runtime untouched.
5. Leftover official `REQUEST_REVIEW` 198 may remain; it was not
   dismissed.
6. Branch protection was not PATCHed. No `.woodpecker.yaml` /
   `.woodpecker.yml` was added. No synthetic commit statuses. No
   `force_merge`.

`main` may still contain root `CODEOWNERS`. That is **not** an
implement failure.

### Land on `main` (merge predecessor; not this issue’s implement bar)

- Existing required status `ci/woodpecker/pr/woodpecker` still gates
  merge. This repo does not post it today.
- Org forge #48 AC5 for `code/cl8y-ecosystem-legal` (catch-all gone from
  `main`) stays open until that context exists and #37 merges with
  `Do: merge` / SHA pin.
- A later same-repo Woodpecker ticket would be that merge predecessor.
  It is not a product-scope change of #37 and is **not** opened here.
  Missing `DEPS` means implement of #37 has no same-repo issue wait.

Not this issue’s failure: Woodpecker still missing, GitLab CI still
exists, CAC #429 unmerged, leftover request 198 still on #37.
