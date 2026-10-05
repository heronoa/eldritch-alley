# Lesson — A title screen as pure modules plus one DOM file, with a connection state machine

**Feature:** title-screen (`title-screen.index.md`, M1 to M3; `frontend/src/title/`, PR #10)
**Date:** 2026-10-05
**Tags:** `#architecture` `#testing` `#process`

---

## Context

The title screen had to draw an animated city, walkers, a stamp that lands on the call to action, and open
a server session before handing the screen to the match. The main risk was that the animation and the
connection logic would be written inside the DOM code and be untestable.

---

## Decisions worth reusing

**Every rule with a rule of its own lives in a module with Node tests**

- Situation: the city layout, walker positions, the ambient schedule, the stamp timing and the connection
  flow all have rules that can break quietly.
- Decision taken: M1 wrote them as `city-data.ts`, `walkers.ts`, `ambient.ts`, `stamp.ts`, `connect-flow.ts`
  and `motion.ts`, each with tests. `title.ts` is only the DOM wiring.
- Applies when: a screen mixes animation, timing and network state. Put each rule in its own module before
  any DOM code exists.

**The connection is a state machine with explicit events**

- Situation: a press can happen twice, the server can answer late, and the screen must not change while the
  stamp is still falling.
- Decision taken: `connect-flow.ts` answers every event with the same flow object when it ignores it. A
  second press changes nothing, and `canTransition` gates the hand-over on the stamp's duration.
- Applies when: a user action starts an async call. Make ignored events a no-op that the caller can detect.

**The match module loads lazily, on the first start**

- Situation: the title must not pay for the game engine.
- Decision taken: the match is imported on the first start, and a failed download releases the session and
  returns the title to a usable state. This was later measured in the bundle-size work.
- Applies when: an entry screen leads to a heavy screen. See the bundle-size lesson.

---

## Armadilhas encontradas

**A contrast requirement with no test file behind it**

- Sintoma: the M3 plan lists a contrast matrix with a file name, `contrast.test.ts`. The file did not exist
  when the milestone was marked done.
- Causa real: the requirement was written in the plan and never turned into a test.
- Solução: the test was written on 2026-10-05, reading the colours from `title.css` itself, so it cannot
  check values the page no longer uses. It records two known gaps (footer about 4.02:1, hovered ink about
  4.15:1) instead of hiding them.
- Sinal de alerta: a plan that lists a test file that is absent from the tree.

**Milestones marked pending while their code was on develop**

- Sintoma: the index showed M2 and M3 as pending, while `title.ts`, `city-render.ts`, `sheet.ts` and
  `title.css` were already merged.
- Causa real: the index was not updated when the PR merged.
- Sinal de alerta: a status that disagrees with the file list. Check both before planning the next step.

---

## O que fazer diferente

- [ ] Write the contrast test with the palette, not in a later milestone.
- [ ] Test the state of each interactive element (hover, focus, disabled), not only its base colour.
- [ ] Update the index in the same PR that merges the milestone.
