# Lesson — A smoke test's feedback: the HUD stops covering the board, and the input becomes a module

**Feature:** smoke-test-2-feedback (`smoke-test-2-feedback.plan.md`, frontend only, seven slices; delivered in PR #16, branch `fix/camera-controls`)
**Date:** 2026-10-07
**Tags:** `#architecture` `#process` `#testing`

---

## Context

After the camera landed, the owner's second smoke test reported three things: the units changed look during a
rotation, the HUD covered the board (two 300 px columns always over it), and inspecting a unit had nowhere to
show its data. Three of the fixes were layout. The fourth — the input rules — turned out to be the interesting
one, and it closed two debts that had been open for a milestone.

---

## Decisions worth reusing

**The board is the product; the HUD gets the edges**

- Situation: a 300 px unit panel on the left and a 300 px log on the right, always drawn over the board.
- Decision taken: the unit's data became a 104 px dashboard along the bottom edge (health at the far left,
  ammunition or energy at the far right, the action bar centred between them, a `Movimento · Ação · Reação` line
  under the buttons); the log became a six-line collapsible box whose header is the toggle; the camera panel took
  the freed right column.
- Applies when: overlays accumulate over the thing the player is looking at. Move the data to the edge, and make
  the log earn its space.

**A moved view is fed by the model that already existed**

- Situation: `frontend/src/game/panel.ts` already produced the rows (HP, movement, action, resource, reaction),
  and only the rendering had to move.
- Decision taken: the dashboard renders the same rows; `panel.ts` did not change for the dashboard.
- Applies when: a panel is re-laid out. Move the rendering, not the model.

**The input rules became a pure module, and that is what closed the debts**

- Situation: DT-79 and DT-84 said the inspection gesture and the pointer/pinch/rotation driving had no test, and
  this project cannot test scene code.
- Decision taken: `frontend/src/game/press.ts` turns pointer events into one declarative outcome — `begin`,
  `tap`, `pan`, `pinchBegin`, `pinch`, `inspect`, `none` — with the 6 px slop, the 400 ms long press, the second
  finger of a pinch and `pointercancel` as rules; the scene keeps only what is Phaser's (the timer, the camera)
  and translates `pointer` into `PressPointer`.
- Applies when: a debt asks for a test of scene code. The answer is usually a design change, not a harness — the
  same conclusion [[ea-12-camera]] records for the camera branch.

**A floating panel claims its whole rectangle**

- Situation: four panels float over the board, each with padding and gaps.
- Decision taken: `hudTakesPress` hit-tests the HUD's rectangles — controls, titles and gaps alike — before the
  board is reached, so a panel over a tile never leaks a click through to the move behind it.
- Applies when: any overlay is placed over an interactive surface.

**Every screen coordinate lives in one table, and geometry is what gets tested**

- Situation: the project has no rendering test, and the layout has to survive a reshuffle of five panels.
- Decision taken: `frontend/src/view/layout.ts` holds every rectangle, and `layout.test.ts` pins the geometry —
  every part inside the canvas, no two parts overlapping, and `buttonIndexAt` matching the rectangle that draws
  the button (DT-30). The chips and the end-turn hint are computed from the bar's own `y`, not from constants.
- Applies when: a layout changes and the drawing cannot be tested. Pin containment, non-overlap and
  hit-test-matches-drawing.

---

## Armadilhas encontradas

**A plan step that needed a browser, in a session that had none**

- Sintoma: slice F had to reproduce DT-81 in the browser to find its cause. The plan's own step 4 says: if you
  cannot run the browser, stop on DT-81, say so, and do the rest.
- Causa real: the defect's model was provably correct (the engine, the chips model and `canStillAct` were all
  right), so only a running browser could show the pixels.
- Solução: the scene's half was pinned by a test (`keeps the two chips of a pending move that spent the whole
  budget`), the debt was **narrowed** rather than closed, and it stayed open — blocking EA-5's acceptance —
  through this branch and the next one, until the chips were decoupled from the armed mode and the chip
  rectangle was anchored above the dashboard.
- Sinal de alerta: a plan step that depends on a manual run. Do it first; a slice that ends on a "stop and say
  so" is a partial slice, and the debt it leaves blocks the next feature on the same screen.

**A per-slice instruction that disagreed with the plan's own decision list**

- Sintoma: slice E's table says a board click closes the inspection window (as EA-6 had it); decision Q4 says the
  X only. The code implements the X only, so while the window is open the player's own move or attack highlight
  stays hidden.
- Causa real: the plan carries two documents — per-slice instructions and an owner decision list — with no rule
  for which wins.
- Solução: named in the MR's divergence list, so the next reader knows the code followed Q4.
- Sinal de alerta: a plan with both a decision list and per-slice instructions. Say which one wins before the
  code is written.

**Four more drifts, made safe by writing them down**

- Sintoma: the log was placed elsewhere and keeps six lines instead of twelve (and the cap now truncates the
  in-memory buffer, so old lines are dropped for good); the settings panel opens under the camera panel, not
  under the gear; Q5 is looser than the slice (the sheet is always four rows, a class with no magazine reads
  `—`); and the plan's acceptance checkboxes were never ticked one by one.
- Solução: the MR's divergence list, item by item, with the reason.
- Sinal de alerta: a plan whose acceptance boxes are all empty while its code is done. The divergence list is
  cheaper than rebuilding the record — write it while the reasons are still in your head.

**A slice that grew a control no plan asked for**

- Sintoma: the settings panel gained a drag-sensitivity stepper (25/50/75/100, default 50 %), which no plan in
  this repository asked for.
- Causa real: it is the owner's request, made during the work, and the settings panel EA-4 had already built was
  the natural home.
- Solução: absorbed and recorded, including its consequence — the map now moves half as far as the finger where
  it used to move 1:1, which is a live change to a shipped feel.
- Sinal de alerta: a live change to a value players already feel. Record it as loudly as a rule change.

---

## O que fazer diferente

- [ ] Pin geometry — containment, non-overlap, hit test against the drawing — when the drawing itself cannot be
  tested.
- [ ] When a debt asks for a test of scene code, look for the pure module that removes the need for the harness.
- [ ] Run the plan's manual step before the slice that depends on it, not after.
- [ ] When a plan carries per-slice instructions and a decision list, name which one wins.
- [ ] Write the divergences into the MR description while the reasons are fresh; an all-empty acceptance
  checklist is a record that stopped being kept.
- [ ] Compute floating controls from the element they float above, not from a constant.

See also [[ea-5-range-display]] (which owns the chips this plan was chasing), [[ea-12-camera]] (the same branch,
and the same answer about testing scene code), [[ea-6-enemy-ranges]] (which got its inspection window here) and
[[map-zoom]] (the zoom the sensitivity now scales).
