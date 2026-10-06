# Plan: EA-12 · Camera: rotation, pan and zoom

**Milestone:** lot 3 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Reference:** `.ia_context/prototypes/eldritch-alley-camera-prototype` (README, `js/maps-camera.js`, `css/styles.css`, screenshots)
**Closes:** DT-67 (map rotation, in `.ia_context/inputs/backlog.md`). Zoom was already delivered (see `map-zoom` lesson).
**Created:** 2026-10-05
**Status:** ready for review

## 0. Findings

- The prototype is **canvas, without Phaser**. The client is Phaser. The plan translates the maths and the behaviour, not the code.
- The prototype's README asks for real devices (iOS Safari, Android Chrome) before EA-12 closes. The owner runs that test.
- The ticket names `eldritch-alley-mapas-mobile`; the reference is `eldritch-alley-camera-prototype`, as confirmed by the owner. The ticket will be corrected in Jira.
- Rotation changes the isometric drawing and the picking (`DT-67` notes: four projections, four depth orders, four picking functions). The prototype solves it by rotating the data before drawing and inverting the rotation when picking.
- Zoom and pan already exist in the client (map-zoom lesson, 2026-10-04). EA-12 extends them: pinch, integer snap, focal point, pan limits.

## 1. Objective

Pan by drag, pinch and wheel zoom in integer steps (1× to 4×), and rotate the view in 90° steps with a short animation. Sprites face the camera. Tall buildings with playable area behind them are cut down in the view. Switching maps resets the view to N.

The engine is not changed. Rotation is a client-only view.

## 2. Slices (one PR each, from the prototype README)

Each slice has its own review. Lot 3 may ship slices 1 to 3 before the deploy and slices 4 and 5 after, if the owner decides.

### Slice 1 · Camera: pan and integer zoom

| File | Operation | What changes |
|---|---|---|
| `src/view/camera-math.ts` | create | Pure: `clampPan`, `snapZoom`, `zoomAround(focal, zoom)`, `isTap(start, end)` (6 px threshold) |
| `src/view/camera-math.test.ts` | create | Maths tests |
| `src/scenes/MatchScene.ts` | modify | Phaser camera uses `camera-math`; pointer handling for drag and tap (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`); second pointer enabled for pinch (`this.input.addPointer(1)`) |
| `src/scenes/HudScene.ts` | modify | Camera control panel: zoom in and out buttons, zoom level label |

**Rules from the prototype:** a gesture under 6 px is a tap (inspects the cell); beyond it, a pan. Pinch zoom is continuous while the fingers move and snaps to an integer when a finger lifts. Wheel and buttons change one integer step, anchored at the cursor (wheel) or the screen centre (buttons). Pan limit: a quarter of the screen beyond the map edges. `pointercancel` is handled like `pointerup`.

### Slice 2 · View rotation

| File | Operation | What changes |
|---|---|---|
| `src/view/rotation.ts` | create | Pure: `rotateCell(cell, n, step)` maps `(x, y)` to `(N − 1 − y, x)` per step; `unrotateCell` is its inverse |
| `src/view/rotation.test.ts` | create | Unit tests for the rotation and its inverse, all four views, on boards of different sizes |
| `src/maps/terrain.ts`, `src/view/iso.ts`, `src/scenes/map/` | modify | Map data is rotated before drawing: tiles, heights, props, units. Picking uses `unrotateCell` |
| Orientation-dependent details | modify | Crosswalk stripes, lane lines, curbs, fences, parapets and cars are recomputed from neighbours, never from fixed positions |

**Picking.** A tap converts the screen point to a cell, then through `unrotateCell`. The round trip must return the same cell for every cell of every map in every view (test).

### Slice 3 · Rotation animation

| File | Operation | What changes |
|---|---|---|
| `src/view/rotation-animation.ts` | create | Pure: progress over 450 ms, cubic ease-in-out; `simplifiedAt(progress)` decides the simplified drawing during the transition |
| Map scene | modify | During the animation: flat blocks, tall buildings translucent, units as billboards. Then the detailed view snaps in |

### Slice 4 · Visibility rules

| File | Operation | What changes |
|---|---|---|
| `src/view/cutaway.ts` | create | Pure: a building at least 4 levels tall, with playable area behind it in the current view (neighbour at x−1, y−1 or the diagonal, not a building), is drawn at 2 levels with a hatched top. Display only |
| `src/view/cutaway.test.ts` | create | Cases from the prototype |
| Translucency | modify | A building covering a unit, or the cell under the cursor or finger, drawn at 28% opacity |

The cutaway is display only: the rules still see the full building (blocks movement and sight).

### Slice 5 · Sprites face the camera

| File | Operation | What changes |
|---|---|---|
| `src/view/billboard.ts` | create | Pure: a unit faces the enemy team's average screen position; the horizontal mirror is computed in screen space after the rotation |
| Unit drawing | modify | Uses the mirror from `billboard.ts` |

Back views are not part of this ticket (DT-58).

## 3. Contract of the layers

- **`rotateCell` / `unrotateCell`**: pure, integer, inverse of each other, defined for `N` the board size.
- **Camera maths**: pure functions of pointer positions and zoom state; the Phaser code calls them.
- **Cutaway and translucency**: pure rules over the board and the view, no rendering.
- **Engine**: no change. A test confirms the engine's state is identical before and after a rotation.

## 4. Tests planned

Unit (per slice, pure modules):
- [ ] `isTap` is true under 6 px and false at 6 px or more.
- [ ] `snapZoom` returns integers 1 to 4; `zoomAround` keeps the focal point under the fingers.
- [ ] `clampPan` allows a quarter of the screen past the edges and no more.
- [ ] `unrotateCell(rotateCell(c))` equals `c` for every cell, every map, every step.
- [ ] Rotation animation: progress is 0 at start, 1 at 450 ms, and the simplified drawing is used only inside the transition.
- [ ] Cutaway: a 4-level building with open ground behind it is cut to 2 levels; a 3-level one is not.
- [ ] Billboard mirror: a unit faces the enemy's average screen position after every rotation.
- [ ] Engine state is unchanged by a rotation.

Manual (owner, before closing):
- [ ] Desktop Chromium: pan, wheel, keyboard, rotate with Q and E.
- [ ] Mobile emulation: pinch, tap versus drag, rotation buttons.
- [ ] Real iOS Safari and Android Chrome (the prototype README requires it).

## 5. Dependencies

- Slice 1 has no dependency in lot 3.
- EA-3 (camera follows the active unit uses the same pan).
- EA-9 (camera follows the bot) depends on slice 1.
- DT-67 is closed by this plan; the backlog entry moves to the closed list when the slices land.

## 6. Decisions (proposed, not yet confirmed)

- **D1. Rotation in 90° steps, client-only.** Confirmed by the ticket.
- **D2. Ship order:** slices 1 to 3 before the deploy, 4 and 5 after (recommended, because 4 and 5 are visual polish). Owner decides.
- **D3. Rotation controls on mobile:** ⟲ and ⟳ buttons, as the prototype (recommended).

## 7. Out of scope

- Back views of the sprites (DT-58).
- Props drawn during the rotation animation (the prototype does not draw them either; accepted).
- Engine changes of any kind.
- Audio (DT-56).
