# Lesson — Movement by destination, and the plan's second tap that did not survive the playtest

**Feature:** ea-2-ea-7-movement-path (`ea-2-ea-7-movement-path.plan.md`, engine + protocol + client; delivered in PR #15, branch `fix/players-feedback`; closes DT-54, DT-70, DT-72)
**Date:** 2026-10-07
**Tags:** `#protocol` `#determinism` `#architecture`

---

## Context

Movement was one tile per action, and the preview lied about it: it highlighted a step of +1 level while any
movement was left, when the engine charges 2 points and refuses when only 1 is left. The fix moved the whole
question into the engine — where can this unit end, and by which walk — and had the client ask for the answer
instead of guessing it. The risk was a protocol change plus a preview that still disagreed.

---

## Decisions worth reusing

**Send the destination, not the path**

- Situation: the client knows the destination the player picked; the engine owns the profile, the cost and the
  blocking rules.
- Decision taken (ADR 0010, D1): the wire carries `move { to }`; the engine finds the cheapest walk and returns
  it inside the `moved` event, so the client animates the route it was told about.
- Alternative rejected: the client sending a path. The server would have to re-validate a walk it did not choose,
  and every desync becomes a rule question.
- Applies when: the server owns the geometry. Send the intent and let the authority compute the route.

**Today's rule becomes data before it becomes a feature**

- Situation: the height rule (`|Δlevel| ≤ 1`, a climb costing 2) was a constant, and a later ticket wanted a
  class to climb 2.
- Decision taken: `MovementProfile { maxStepUp, maxStepDown, climbCost }` on the unit, with defaults equal to the
  old rule, so every existing match replays identically. The future ability changes a number, not a rule.
- Applies when: a constant inside a rule is about to be varied by class or ability. Turn it into a field whose
  default is the current value.

**Ties are broken by a fixed neighbour order**

- Situation: several cheapest paths usually exist on a grid.
- Decision taken: costs are 1 or 2, so Dijkstra runs on a bucket queue, and ties break on a fixed `(x, then y)`
  neighbour order. The same state always yields the same path — which is what lets a replay rebuild the same
  state (ADR 0005).
- Applies when: any search whose result is written into an event or a hash.

**Two failures that look alike to the player are not the same refusal**

- Situation (D3): a forbidden step can be the reason a destination is unreachable, or just one obstacle among
  several.
- Decision taken: keep `height-step-too-high` when the step is *the* cause; `no-path` otherwise. The preview
  paints neither.
- Applies when: a refusal reason is shown to the player. The reason names the cause, not the symptom.

---

## Armadilhas encontradas

**The interaction the plan designed did not survive its first play**

- Sintoma: EA-7 planned two taps — the first shows the path and its cost, the second confirms. By the merge the
  preview was gone (commit `ee65a73`): one tap on a reachable cell sends the move, and the confirmation is the
  state's own pending move with its two chips.
- Causa real: the interaction was designed in a plan, reviewed in a diff, and never played. The owner's first
  play replaced it.
- Solução: the divergence is written in the MR; the plan's rule "one tap never moves a unit" no longer holds.
  DT-72 (which the plan was to close) could not be closed as planned, because there is no first tap left to
  preview — it was closed later as obsolete.
- Sinal de alerta: an interaction specified only on paper, with a debt that depends on its exact shape.

**A documented escape hatch became dead code**

- Sintoma: `applyEvent` kept a fallback for "a `moved` event without a path", while the same plan made the path
  mandatory.
- Causa real: the fallback was written for compatibility, then the compatible case stopped existing.
- Solução: DT-73 made the branch unreachable; its removal was deliberately left out of that close because a
  review had not approved it, and it is still there.
- Sinal de alerta: a fallback whose condition the same change makes impossible.

---

## O que fazer diferente

- [ ] Play the interaction a plan describes before calling the plan ready, or mark the interaction explicitly as
  unvalidated.
- [ ] When a ticket is closed by a change of interaction, re-check every debt that named the old interaction.
- [ ] With a protocol bump, state in the plan which client the server refuses — and bump the version on both
  sides in one change.
- [ ] When a rule becomes data, ship the field with the old value as its default, so replays do not move.

See also [[ea-1-line-of-sight]] (the shared-rule shape this plan extends to `reachableCells` and `findPath`) and
[[debt-dt73-validate-moved-path]] (what happened to the path once it reached the replay).
