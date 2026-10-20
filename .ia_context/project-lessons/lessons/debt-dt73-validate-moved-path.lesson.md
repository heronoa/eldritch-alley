# Lesson — Validating an event the engine is asked to trust

**Feature:** debt-dt73-validate-moved-path (`debt-dt73-validate-moved-path.plan.md`, engine only; closes DT-73)
**Date:** 2026-10-07
**Tags:** `#determinism` `#testing` `#types`

---

## Context

`applyEvent('moved')` computed a cost and moved a unit from a path it never checked: no adjacency, no bounds, no
profile, no destination. A replay of a tampered or corrupted event produced a wrong final state in complete
silence. The debt's own trigger was the start of M4, and it was done ahead of it at the owner's request.

---

## Decisions worth reusing

**Validate the event at the door, against the same rules that produced it**

- Situation: the engine both *generates* a walk (`findPath`) and *applies* one from a stored event, and only the
  generator was checked.
- Decision taken: `requireWalk` in `applyEvent` refuses a path that is empty, does not end on `to`, leaves the
  board, is not next to the cell before it, breaks the movement profile, or costs more than the movement left.
- Applies when: a function applies data it did not compute. The replay and the live path must obey one rule, or
  the replay is a second implementation of the game.

**Throw, instead of returning a result**

- Situation: three ways to report a malformed path were on the table.
- Decision taken: throw an `Error` whose message names the rule that failed (`moved: step 2 is not adjacent to
  the previous cell`). Rejected: `applyEvents` returning an error value (more code on the happy path, a new
  signature), and a separate `validateEvent` the loader calls on its own (which the loader can forget — the exact
  failure the debt described).
- Applies when: the caller can do nothing useful with a malformed event. Fail loud and early.

**A property test ties the validator to the generator**

- Situation: a validator is easy to write too strictly, and the failure shows up as a replay that no longer
  loads.
- Decision taken: for every path `findPath` returns on sample maps, `applyEvent` accepts the matching `moved`
  event — the check cannot start refusing what the engine itself produces.
- Applies when: adding a check on the output of another function. Test the pair, not the check alone.

**A refusal never applies anything partially**

- Situation: the state is cloned before it is changed, and a validation that ran after the first mutation would
  leave a half-applied turn.
- Decision taken: validate before computing the cost, so the input state is identical after a refusal — asserted
  by deep comparison in every refusal case.
- Applies when: a function mutates as it validates. Validate first, or validate on the clone.

---

## Armadilhas encontradas

**A gate ahead of its trigger, opened by a person**

- Sintoma: the plan opens with an explicit gate warning: the debt's trigger is the start of M4, M4 had not
  started, the roadmap still had an open M2-b test, and the execution therefore needed the owner's own "proceed
  anyway".
- Causa real: the work was small, well understood, and useful before its trigger.
- Solução: the warning sits at the top of the plan, names the trigger, says it blocks nothing, and names who can
  open it. Nobody had to guess whether the plan was impatient or approved.
- Sinal de alerta: a plan whose trigger has not fired. Write at the top who can open it and what they are
  accepting, or it will be read as either forbidden or already approved.

**A fallback that the check made unreachable**

- Sintoma: `applyEvent` had a documented fallback for "an event with no path", and the new rule requires a path,
  so the branch can no longer be reached.
- Causa real: the compatibility fallback predates the rule that removes its case.
- Solução: the close left the removal out, on purpose, because a review had not approved it — and it is recorded
  as the open question of that close, still there today.
- Sinal de alerta: a validated precondition that leaves a branch behind. Name it in the same change, or it
  becomes the next reader's "is this dead?" question.

---

## O que fazer diferente

- [ ] A validator of events and the code that generates them share one property test.
- [ ] When a plan runs ahead of its trigger, put the gate and who can open it at the top of the plan.
- [ ] Say whether a refusal throws or returns a result, and why, in the plan.
- [ ] When a check makes a fallback unreachable, remove it in the same change or list it explicitly.

See also [[ea-2-ea-7-movement-path]] (which introduced `path` into the `moved` event this validates) and
[[engine-m1]] (the determinism rules the validation protects).
