# Lesson — Inspecting a unit that is not on turn: a third state that paints and sends nothing

**Feature:** ea-6-enemy-ranges (`ea-6-enemy-ranges.plan.md`, client only; delivered in PR #15, revised and completed in PR #16, branch `fix/camera-controls`)
**Date:** 2026-10-07
**Tags:** `#architecture` `#process` `#testing`

---

## Context

The player could not see what an enemy threatened. The ticket first planned to paint the enemy's movement set
*and* a threat layer on top of it. The owner cut both, leaving one read-only area reached by a fixed secondary
gesture. The risk was a third state on a screen where the primary click already means "act".

---

## Decisions worth reusing

**Inspection is a third state, and it restores by itself**

- Situation: a screen with two interactive states (choosing a move, choosing a target) needed a third,
  read-only one.
- Decision taken (D2): the inspection changes neither the acting unit nor the turn, spends nothing and sends
  nothing; and because it never edits the state the highlight is derived from, closing it brings the state's own
  highlight back with no "restore" code.
- Applies when: a UI affordance answers a question instead of making a move. Keep it out of the state everything
  else is derived from, and the restore is free.

**The gesture is fixed and secondary**

- Situation (D4): in the pending-move and attack states, a primary click on an enemy already means "choose it as
  the target".
- Decision taken: the inspection takes the right button on desktop and the long press on touch, in every state;
  the primary click is always an action.
- Applies when: adding a gesture to a surface whose primary click is taken. The new gesture moves; the primary
  one never changes meaning.

**The gesture thresholds are shared with the camera's**

- Situation: the same surface already distinguished a tap from a pan.
- Decision taken: 400 ms long press, cancelled by more than 6 px of travel — the same numbers the pan uses.
- Applies when: two gestures share a surface. They share their thresholds, and they live in one module.

**The engine gained nothing**

- Situation: the inspection needed "the cells this unit can attack from where it stands", for a unit that does
  not hold the turn.
- Decision taken (D3): `attackArea(state, from, unit)` (EA-5) already takes the unit and the cell, so it answers
  for any unit. `reachableCellsFor` and `threatArea` were struck from the plan.
- Applies when: a new screen asks a question. Check whether an existing pure function already takes what the
  screen has before adding another one.

---

## Armadilhas encontradas

**A layer nobody owned, twice**

- Sintoma: `threatArea` was planned in this ticket and in EA-5, and survived in both plans until one revision
  removed it from both.
- Causa real: it was a derived convenience ("what would I threaten if I moved") that answered a question the
  game had not asked yet, and it needed a third tone and a toggle to exist at all.
- Solução: EA-5's D2 deleted it from the plans and the engine, and said why, including "not kept for later".
- Sinal de alerta: a set that exists to be shown alongside another set the player has not asked for yet.

**A legend line that had nowhere to go**

- Sintoma: the plan's client table said "legend line for the inspection, if needed". The MR's divergence list
  records that it did not fit — `LEGEND_RECT` holds two 12 px lines and `STATUS_RECT` starts 8 px below — and it
  needed a layout decision that never came.
- Causa real: "if needed" is a decision with no owner.
- Sinal de alerta: an "if needed" or "to confirm" in a plan's file table. Either decide it or delete the row.

**A plan revised in place, whose old text still reads as the design**

- Sintoma: the plan's section 2 still describes the gesture table of the first revision unless the reader sees
  the revision note at the top.
- Solução: the plan carries a dated "Revised" line above the old text, which is what makes reading it safe.
- Sinal de alerta: a plan edited in place with no revision line. A reader cannot tell the decision from the
  history.

---

## O que fazer diferente

- [ ] A read-only affordance never touches the state the highlight is derived from.
- [ ] Before adding an engine function, check whether an existing one already takes what the new screen has.
- [ ] Gestures on one surface share their thresholds and live in one pure module.
- [ ] A plan revised in place keeps a dated revision line above the replaced text.
- [ ] "If needed" in a plan's file table is a decision nobody owns — decide it or remove the row.

See also [[ea-5-range-display]] (which owns `attackArea` and the one-area-per-state rule this feature obeys),
[[ea-8-sprite-target]] (the primary click the inspection had to stay clear of) and
[[smoke-test-2-feedback]] (which finally gave the inspection a window to show its data in).
