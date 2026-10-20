# Lesson — "Whose turn is it": one answer, and a banner that is a pure function

**Feature:** ea-3-turn-indicator (`ea-3-turn-indicator.plan.md`, client only; delivered in PR #15, branch `fix/players-feedback`)
**Date:** 2026-10-07
**Tags:** `#architecture` `#testing` `#process`

---

## Context

First-time players could not tell whose turn it was and thought the match had frozen. The ambiguity was not
missing art: it was a question the client answered in several places at once — the arrow, the dimming of other
units, the queue highlight and the banner each derived it separately. Client only; no engine, no protocol, no
server change.

---

## Decisions worth reusing

**The question gets one function**

- Situation: four widgets needed "whose turn is it" and "is it the human's".
- Decision taken: `activeSlot(state)` and `isHumanTurn(state, humanTeam)` in `frontend/src/game/turn-order.ts`,
  pure, and every widget reads them.
- Alternative rejected: each widget reading `state.currentIndex` for itself.
- Applies when: the same small question is asked in several widgets. Answer it once; the widgets read the answer.

**An element that exists because something changed is a function of the before and the after**

- Situation: a banner appears on every turn change and at the start of the match, and must not appear after a
  move by the same unit.
- Decision taken: `bannerFor(previous, current, humanTeam)` returns `{ text, durationMs: 1500 }` or `null` when
  the active unit did not change. Pure, tested in Node, no scene.
- Applies when: a transient element (a banner, a toast, a flash) exists because of a transition. Take the two
  states and return the element or nothing, instead of tracking "did it change" inside the scene.

**A fading overlay never takes the pointer**

- Situation (D1): the banner fades over the board for 1.5 s while the action bar and the map must stay usable.
- Decision taken: 1.5 s, fading on its own, no pointer events while it fades.
- Applies when: a transient element is drawn over interactive surface. Being visible is not being there.

---

## Armadilhas encontradas

**A decision recorded as "assumed" and then shipped**

- Sintoma: the plan's D2 fixes the non-acting units at alpha 0.6 and says the owner will confirm after a phone
  test. The value shipped, unconfirmed.
- Causa real: an assumption written down honestly is easy to mistake for a decision once the code exists.
- Sinal de alerta: a plan marked "ready for implementation (decision D2 assumed)". Assumptions that need a
  person should block the status line, not decorate it.

**A plan status that no longer describes its own code**

- Sintoma: EA-1 … EA-6 still read "ready for implementation" / "ready for review" long after the merge. The
  branch's own description says it plainly: the plans "are not wrong, they are unfinished as records".
- Causa real: the status line is edited by hand and nothing checks it.
- Solução: closing the feature is where the status moves — and where the plan stops being the reference.
- Sinal de alerta: a plan whose acceptance list is done but whose status line still says "ready". (m2a and
  debt-quick-wins record the same trap; it is the project's most repeated one.)

---

## O que fazer diferente

- [ ] One function per question the UI asks, and every widget reads it.
- [ ] An element that exists because of a change is a pure function of the before and the after.
- [ ] A fading overlay never takes the pointer.
- [ ] An assumption that needs the owner's eyes keeps the plan out of "ready", and closing the feature is what
  moves the status line.

See also [[ea-4-auto-end-turn]] (the other half of turn clarity, which owns the countdown) and
[[m2a]] (the same status-line trap, recorded there first).
