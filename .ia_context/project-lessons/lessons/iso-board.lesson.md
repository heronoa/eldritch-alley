# Lesson — Isometric board drawn over a flat grid, with a HUD floating above it

**Feature:** iso-board (`iso-board.index.md`, M1 to M3; `frontend/src/view/iso.ts`, PR #8 with visual identity)
**Date:** 2026-10-05
**Tags:** `#architecture` `#testing` `#process`

---

## Context

The match was a flat 8×8 grid, and the prototype was isometric with three height levels. The engine,
the server and the protocol stayed unchanged. The risk was in the picking: a click on an isometric block
can hit the wrong cell when two blocks overlap, and a HUD drawn beside the board hides nothing, so the
board and the panels had to be laid out together.

---

## Decisions worth reusing

**Projection and picking live in a pure module**

- Situation: the projection and the click-to-cell mapping are arithmetic, and they are easy to get
  wrong in a way that only shows on screen.
- Decision taken: `view/iso.ts` does the projection, the depth order (`x + y`) and the picking, with no
  Phaser import. Its tests run in Node. The scene only draws what the module returns.
- Applies when: any 2D or 2.5D view where the geometry has to be right and the rendering library is
  heavy to test.

**The HUD is tested first, then the board**

- Situation: an overlay panel sits over the board, and a click inside a panel must not reach the cell
  under it.
- Decision taken: any point inside a HUD rectangle is consumed, even if no button is there. The board is
  picked only after the HUD says no.
- Applies when: an overlay covers an interactive surface. Decide the order once, in one place.

**Remove the old helpers instead of keeping both projections**

- Situation: `grid.ts` still had the flat `cellToPixel` and `pixelToCell`, and two projections in the
  same codebase drift apart.
- Decision taken: M1 removed the flat helpers; heights kept their colours in `grid.ts`.
- Applies when: a rendering change replaces a function. Delete the old one in the same milestone.

---

## Armadilhas encontradas

**The plan's file names rotted after the milestone was approved**

- Sintoma: the plans name `scenes/BoardTiles.ts` and `grid.test.ts`. `BoardTiles.ts` no longer exists,
  and `grid.test.ts` was deleted in `a5cdc49` ("remove obsolete grid tests").
- Causa real: a later refactor moved the board drawing to `scenes/map/MapView.ts` and `cell.ts`. The
  plans were not revisited.
- Sinal de alerta: a plan that names a file that does not exist. Check the file list before closing.

**Checklists left unticked after the feature shipped**

- Sintoma: 52 checkboxes were open across the three milestone plans, while the code was in `develop`.
- Causa real: the checklists were not updated when the milestones closed, and the index was the only
  status that moved.
- Sinal de alerta: a closed index beside unchecked checklists in its plans.

---

## O que fazer diferente

- [ ] Tick each checklist item when its milestone closes, or write what replaced it.
- [ ] When a file moves, update every plan that names it in the same change.
- [ ] Keep geometry in a pure module with Node tests, so the view only draws.
