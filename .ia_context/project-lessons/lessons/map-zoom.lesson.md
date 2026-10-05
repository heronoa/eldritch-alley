# Lesson — Zooming a Phaser board without zooming the HUD

**Feature:** map-zoom (`map-zoom.plan.md`; `frontend/src/view/camera.ts`, `frontend/src/scenes/HudScene.ts`, PR #9)
**Date:** 2026-10-05
**Tags:** `#architecture` `#testing` `#process`

---

## Context

The player needed to zoom the board with the wheel and the keys, around the point under the cursor. The
obvious way in Phaser is to zoom the camera, but that enlarges everything the camera draws, including the
HUD panels, the buttons and the text. The risk was a HUD that grows and covers the board at 2.5×.

---

## Decisions worth reusing

**Split the HUD into its own scene instead of fighting the camera**

- Situation: a camera zoom scales every object in its view, so the panels would scale with the board.
- Decision taken: the HUD became a second scene, `HudScene`, drawn above the match scene and never zoomed.
  The match scene keeps every click and the game logic. The HUD scene only draws the view it is given.
- Applies when: a game has a fixed overlay over a zoomable world. Give the overlay its own scene from the
  start, before the first panel is positioned against the world.

**Zoom math is a pure module tested in Node**

- Situation: keeping the point under the cursor fixed while zooming, and clamping the centre to the board, is
  arithmetic that is easy to get subtly wrong.
- Decision taken: `view/camera.ts` exports `zoomAbout` and `clampCentre`. Its tests check that the cursor
  point stays within 1 px after a zoom in and a zoom out, that the zoom stays between 1 and 2.5, and that the
  centre is clamped.
- Applies when: any zoom or pan. Write the invariant ("the point under the cursor stays put") as a test.

**Two coordinate spaces, one per kind of click**

- Situation: after a zoom, a click on the board is not at the same place on screen as the cell it hits.
- Decision taken: board clicks use the world position of the pointer, which is zoom-aware. HUD clicks use the
  screen position, as before.
- Applies when: a zoomed world sits under an unzoomed overlay. Decide which space each input belongs to, and
  write it down.

---

## Armadilhas evitadas

**Enlarged panels, found on paper before any code**

- Sintoma (projected, not observed): with a camera zoom, the unit panel and the action bar would grow to 2.5×
  and cover the board.
- Causa real: the camera scales everything it draws. The plan's rationale says so in its first section.
- Sinal de alerta: a request to zoom a game whose UI is drawn by the same camera.

---

## O que fazer diferente

- [ ] Separate the overlay from the world before positioning any element against the world.
- [ ] Decide the coordinate space of each kind of input in the plan, not in the code.
- [ ] Keep the owner's manual checks as a list in the plan, and record the date of the owner's validation.
