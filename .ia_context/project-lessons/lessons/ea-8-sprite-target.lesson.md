# Lesson — Clicking the figure, not the floor: hit testing against what is drawn

**Feature:** ea-8-sprite-target (`ea-8-sprite-target.plan.md`, client only; delivered inside PR #16, branch `fix/camera-controls`)
**Date:** 2026-10-07
**Tags:** `#architecture` `#testing` `#process`

---

## Context

A unit's sprite is drawn taller than the cell it stands on, so a click on a figure's body landed on the cell
*above* it and was not an attack. The fix had to agree with what the player sees, at every zoom, without touching
a single rule.

---

## Decisions worth reusing

**Hit test the drawn box, not the logical position**

- Situation: `resolveClick` found the occupant by floor cell, and a tall sprite is drawn over its neighbour.
- Decision taken: `unitAtPoint(units, point, layout)` in `frontend/src/game/hit.ts` — the sprite's bounds plus a
  margin, top-most unit wins when two overlap (depth order), so the click matches what the player sees.
- Applies when: a target is drawn larger than its logical position. The click follows the drawing, not the model.

**A touch tolerance is divided by the zoom**

- Situation: the plan asked for a 4 px margin so a target is easy to hit on a phone, on a view that zooms 1×–4×.
- Decision taken: the margin is in screen pixels and divided by the zoom, so it stays the same coverage under the
  finger at every step.
- Applies when: a tolerance is added to a zoomable view. In world units it shrinks on screen as the player zooms
  in, which is exactly when they need it.

**A refusal explains itself, and is never swallowed**

- Situation: an invalid target used to do nothing at all.
- Decision taken: `resolveClick` returns a `refused` intent carrying the engine's own `RejectReason`
  (`target-out-of-range`, `no-line-of-sight`, `no-ammunition`, `no-mana`), and `allowsIntent` lets that intent
  through in every mode so the mode filter cannot eat it.
- Applies when: a click can fail. The failure is a message, and the message comes from the authority.

**The predicate is the engine's, not a second rule**

- Situation: the client had to decide "would the server refuse this?" before sending.
- Decision taken: the refusal list comes from `attackArea` (EA-5) and `hasLineOfSight` (EA-1), imported from the
  engine.
- Applies when: the client paints or explains a decision the server makes. Use the server's function.

---

## Armadilhas encontradas

**A small ticket landed inside another ticket's branch**

- Sintoma: DT-85 — EA-8's hit test and refusal intent sit in the EA-12 camera branch, against rule 5 of
  `CLAUDE.md` (one subject per diff). The debt says the review of EA-8 is diluted in the review of the camera.
- Causa real: EA-8 was small, the camera branch was open, and the click resolution was in the same file.
- Solução: recorded as a debt whose trigger was "before the MR is opened, deciding whether to split". The MR
  opened without splitting, and the description says the owner decides — so the item is still open as a record.
- Sinal de alerta: a ticket whose whole diff sits in one file that another open branch is rewriting. That is the
  moment to decide, not at review time.

**A dead module kept alive by its own test**

- Sintoma: `frontend/src/view/camera.ts` is superseded by `camera-math.ts`, still exports a `MAX_ZOOM` of 2.5
  that contradicts the delivered 1×–4×, and is kept green by its own test file.
- Causa real: the successor arrived in a different slice, and the predecessor was never removed.
- Sinal de alerta: two modules answering the same question, each with a test. The tests prove each one works,
  not that both should exist.

---

## O que fazer diferente

- [ ] A tolerance in a zoomable view is expressed in screen pixels and divided by the zoom.
- [ ] A refused click returns the authority's own reason, and the intent is exempt from mode filtering.
- [ ] When a module gains a successor, delete the predecessor in the same change.
- [ ] Do not merge a small ticket into a branch with a different subject without recording the decision.

See also [[ea-12-camera]] (the branch this landed in, and the zoom the margin is divided by),
[[ea-1-line-of-sight]] and [[ea-5-range-display]] (the functions the refusals come from).
