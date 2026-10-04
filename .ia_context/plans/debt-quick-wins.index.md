# Index — Quick wins on the technical debt: small effort, high impact

**Created on:** 2026-10-04
**Branch to create from:** `develop`, after `feat/visual-identity` is merged (suggested name: `chore/debt-quick-wins`). The debt file itself is updated in the same branch.
**Source:** `.ia_context/inputs/technical-debt.md`, open items with effort P

## Goal

Close the open debts that are cheap to fix and cost the most when left open. Each one is a few lines, or a
test and a few lines. Nothing here changes the engine rules, the protocol or the look that the owner approved.

## Selection

Criteria: effort **P**, and either a blocked user path, a test suite that does not run or does not
protect, or a visible defect. Excluded on purpose:

| Debt | Why it is out |
|---|---|
| DT-53 attack after movement | Not reproduced. Needs the owner's steps first. |
| DT-54 pathfinding | Effort G and an architecture decision. Its own plan. |
| DT-48 invariants of the map plan | Fix is in the map plan text; do it with `map-variety` M1, not as code. |
| DT-51 branch with three subjects | Git hygiene, done by the owner at the MR, not in code. |
| DT-12, DT-40 bundle | Needs a measurement first. |
| DT-41, DT-47 scene tests | Effort M. DT-47 is partly covered by M2 below (a constant test). |

## Milestones

| # | Plan | Debts | Status | PR |
|---|------|-------|--------|----|
| 1 | [debt-quick-wins-m1-backend.plan.md](./debt-quick-wins-m1-backend.plan.md): test suites that run and protect, and the server's message check | DT-32, DT-31, DT-20 | [ ] pendente | — |
| 2 | [debt-quick-wins-m2-client.plan.md](./debt-quick-wins-m2-client.plan.md): effects on top of the board, a way out of the match, dead units, the turn queue with portraits | DT-44, DT-47 (partial), DT-59, DT-24, DT-52 | [ ] pendente | — |

## Dependency notes

- M1 first. DT-32 makes the server suite run, and DT-20 needs that suite to prove the check.
- M2 has no dependency on M1; the two can be reviewed separately.
- When a milestone is done, update each debt's status in `technical-debt.md`: move the entry to the Closed table with its resolution, as the file requires.
