# MR — Camera controls (pan, pinch zoom, 90° rotation, cutaway) with the smoke test 2 HUD feedback

**Branch:** `fix/camera-controls`
**Base branch:** `develop`
**Milestone:** Lot 3 (before the AWS staging deploy) — EA-12 camera plus the smoke test 2 feedback
**Ticket(s):** EA-12, EA-8, EA-6, EA-4; closes DT-72, DT-79, DT-82, DT-83, DT-84, DT-86 and DT-87
**Date:** 2026-10-06

---

### 1. What this MR delivers

The player can now move the camera over the board and look at it from four sides. A drag pans, the arrow
keys and WASD pan by 80 canvas px a press, the wheel and the camera panel's own buttons zoom in whole steps
from 1× to 4×, and two fingers pinch to zoom. Q and E, or the panel's ⟲ and ⟳, turn the whole view a quarter
turn. The turn is a client-side illusion of 450 ms with a cubic ease-in-out: the board is never mutated and
the engine is never asked, so every server coordinate is read through `rotateCell` on the way to the screen
and through `unrotateCell` on the way back from a tap — the cell the player sees is the cell the server is
told about. Buildings that would hide the fight are drawn out of the way: a building of four levels or more
with open ground behind it in the current view is cut down to two levels with a hatched top, and a building
that stands in front of a unit is drawn at 28 % opacity while it covers it.

The HUD stopped covering the board. The unit's data left the left column and became a 104 px dashboard along
the bottom edge — health at the far left, ammunition or mana at the far right, the action bar centred between
them and the `Movimento · Ação · Reação` line under the buttons — fed by the same rows `game/panel.ts` already
produced, so the model did not change. The log moved to the top of the freed left column and is collapsible:
closed by default it shows its header and the last line, and its header is the toggle. The camera panel took
the top of the right column, the gear kept its corner, and the settings panel it opens grew a second row: the
drag sensitivity, the owner's request, a `−` and a `+` with the value read between them, stepped 25/50/75/100,
defaulting to 50 % and stored in the browser. Reading the unit sheet is now a thing the player does on
purpose: a long press on a figure (or the right button) opens a 400×240 sheet with four rows — health over
maximum, the resource, the unit's own movement per turn and its reaction — closed by its X and by nothing else.

Under all of it, the input layer became a pure module. `game/press.ts` turns each pointer event into one
declarative outcome (`begin`, `tap`, `pan`, `pinchBegin`, `pinch`, `inspect`, `none`), so the slop of 6 px, the
400 ms long press, the second finger of a pinch and `pointercancel` are rules with tests instead of scene code;
only the timer stays in the scene, because a timer is I/O. Targeting follows the same idea: `game/hit.ts`
resolves a press anywhere on a figure to its unit, top-most figure first, and `game/selection.ts` now names
that unit explicitly and answers a rejected order with the engine's own reason instead of doing nothing.

The change is frontend only. No engine change, no protocol change (the version stays 5) and no new ADR.

Divergences from the approved plans, named explicitly:

- **DT-81 is not resolved.** Slice F of the smoke test 2 plan required reproducing it in the browser and
  fixing the cause, and its step 4 says to stop and say so when the browser cannot run — it could not. The
  scene's half is now pinned by a test (`keeps the two chips of a pending move that spent the whole budget`),
  and the debt stays open with a note placing what is left in `HudScene.drawMoveChips` or in what the server
  sends. **This is the one item of that plan's debt table that did not close in this MR.**
- **Slice E follows the owner's decision Q4, not the slice's own table.** The table says a board click closes
  the inspection window, as EA-6 had it; Q4 decided the X only, and the code implements the X only. A board
  press still acts normally and leaves the window and its inspection highlight standing, so the player's own
  move or attack highlight stays hidden until the X is pressed. Q5 is also looser than planned: the sheet is
  always four rows, and a class with no magazine gets the mana row reading `—`, where the plan said a row
  only for a class with a magazine.
- **Slice C places the log differently and keeps less of it.** The plan put the log over the bar; the code
  moved it to the top of the left column, which is what freed the right column for the camera panel. The
  twelve lines became six, and the cap now also truncates the in-memory buffer, so older lines are dropped
  for good and not merely hidden.
- **The settings panel opens under the camera panel, not under the gear.** The camera panel occupies the
  space the popup used to be drawn over. The panel also grew the drag stepper, which no plan asked for: it is
  the owner's request, absorbed into the settings panel EA-4 had already built.
- **The second half of EA-12's translucency is not delivered.** The plan promised 28 % for a building covering
  a unit *or the cell under the cursor*; only the first half exists. The code says so itself — the client has
  no hover to read a cell from.
- **The gesture rules moved out of the scene, which the plan had not asked for.** EA-12 slice 1 had the scene
  handling the pointer events directly. They are now `game/press.ts`, which is what closed DT-79 and DT-84;
  the scene is an adapter.

---

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `frontend/src/view/camera-math.ts` *(new)* | Pure camera arithmetic: `MIN_ZOOM` 1, `MAX_ZOOM` 4, `TAP_SLOP_PX` 6, `PAST_EDGE` 0.25, `snapZoom`, `zoomAround`, `clampPan`, `isTap` | The camera's numbers are unit-testable; the scene only reads and writes them. Zoom keeps the world point under the finger pinned, and the map can be pushed aside but never lost |
| `frontend/src/view/rotation.ts` *(new)* | Pure: `rotateCell`, `unrotateCell`, `rotatedSize`, `viewDirection`, `viewTurns`, four view directions | One source of truth for the view. The tap has to survive a rotation, and a round trip over every cell of every map in every view is what proves it |
| `frontend/src/view/rotation-animation.ts` *(new)* | Pure: `ROTATION_MS` 450, `rotationProgress`, `easeInOutCubic`, `rotationAngle`, `simplifiedAt` | The timing contract of the turn, tested without a canvas. `simplifiedAt` is what says when the detailed board comes back |
| `frontend/src/view/cutaway.ts` *(new)* | Pure: tall buildings cut to two levels when open ground stands behind them; `covers` decides translucency, depth-aware | Display-only visibility. A building in front of a unit never becomes translucent, and a cut building still blocks movement and sight for the engine |
| `frontend/src/scenes/map/RotationView.ts` *(new)* | Draws the turn onto one canvas over the still board: rotated projection, back-to-front sort, near walls and top faces, tall buildings at 55 % , units from their own sheets | Carries the animation. Deliberately draws no props |
| `frontend/src/scenes/map/MapView.ts`, `map/cell.ts`, `map/props.ts` | Drawing follows a rotated reading of the terrain; `setCovered` makes a building translucent; crosswalk stripes and lane markings are rebuilt from neighbours and stored as edges; cars are placed in `CAR_FRAME[view]` | Orientation-dependent detail comes out right in all four views without four drawing routines, and cars keep their bonnet forward |
| `frontend/src/game/press.ts` *(new)* | Pure `Gestures`: the outcomes above, `LONG_PRESS_MS` 400, the 6 px slop, a third finger ignored, a second finger taking the first finger's press down with it, `cancel()` | Closes DT-79 and DT-84. What was untested pointer logic is now rules the scene obeys |
| `frontend/src/game/hit.ts` *(new)* | Pure `unitAtPoint`: the 32×48 sprite box plus a caller margin, dead units skipped, ties broken by draw depth | Closes EA-8. A press anywhere on a figure is a press on that unit, and the margin is divided by the zoom so a finger keeps the same coverage at 4× |
| `frontend/src/game/selection.ts` | `resolveClick` takes the named unit; range and line of sight read its own position; a new `refused` intent carries the engine's `RejectReason`, and `allowsIntent` always lets it through | The click hits what the player sees, and a refused order explains itself instead of silently doing nothing |
| `frontend/src/game/panSensitivity.ts` *(new)* | The stepper's model: 25 to 100 by 25, default 50, `panFactor`, a read and a write that never throw | The owner's drag knob. A stored value the panel cannot show falls back to the default rather than being rounded onto the screen |
| `frontend/src/game/inspect-window.ts` *(new)* | Pure `unitSheet(state, unitId)`: a title and the four rows | The sheet is a question and sends nothing. Row choice stays out of the scene and testable in Node |
| `frontend/src/scenes/MatchScene.ts` | The gesture wiring, the camera state and keys, the rotation turn, `logOpen`/`settingsOpen`/`panSensitivity`/`inspectedId`, the nine-rectangle read order of `hudTakesPress`, the cutaway pass, `panFactor` in the move handler | Where clicks become actions. `hudTakesPress` claims every point inside each rectangle — controls, titles and gaps alike — so a panel floating over a tile never leaks a click to the board. The drag factor is read in exactly one place, so the keyboard's 80 px step is untouched |
| `frontend/src/scenes/HudScene.ts` | `drawPanel` became `drawDashboard` with its cells and turn line; new `drawLog` with the chevron, `drawInspection` with its X, `drawPanRow` with the stepper; settings panel is two rows | The only rendering layer. It draws what it is handed and decides nothing |
| `frontend/src/view/layout.ts` | `PANEL_RECT` and its helpers removed; the dashboard set, the collapsible log, the moved camera panel, the settings stepper rects and the inspection window added; carousel moved between the columns; `MOVE_CHIP` height 24→32 | The single source of truth for every screen coordinate, and `hudRects()` shrinks to the four rectangles always on the screen. DT-83 closed: the Confirmar/Cancelar chips now have room for their labels |
| `frontend/src/view/unit-look.ts`, `view/billboard.ts` *(new)*, `scenes/units.ts`, `scenes/BootScene.ts` | Sprite geometry and the idle frame in one place; `facesRight`/`mirrored` from the enemy centroid; the sheet frame comes from the same constants | The standing sprite, the turn chip and the figure drawn during a rotation choose the same frame and the same mirror, so a unit cannot face one way at rest and the other mid-turn |
| `frontend/src/maps/terrain.ts` | `terrainOf(id, steps)` returns a view-turned map; `mapSize`; lanes as edges; `props` carry a view | Rotation is a reading and never mutates `PROTOTYPE_MAPS` (DT-87), and downstream drawing works in view coordinates without knowing a view exists |
| `frontend/src/view/layout.test.ts`, `scenes/MatchScene.test.ts`, `maps/terrain.test.ts`, and the five new pure test files | 643 cases in 51 files, from 628 | The layout is pinned by geometry, the scene's decisions by a stubbed Phaser, and every new pure module by its own tests |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | The inspection title, the two keys of the drag row, and shorter Confirmar/Cancelar labels | Copy is in the catalog, and the English one is complete by type |
| `.ia_context/inputs/technical-debt.md`, `technical-debt-closed.md`, `backlog.md` | Seven debts moved to the closed list with their resolution; DT-81 annotated as narrowed; DT-85 and DT-88 recorded; DT-89 added to the backlog | The bank follows the code |
| `.ia_context/plans/smoke-test-2-feedback.plan.md` *(new)* | The approved plan of this work, with its five owner decisions | The reasoning behind the HUD reshuffle is public with the code |
| `.ia_context/prototypes/eldritch-alley-camera-prototype/` *(new)* | The camera handoff prototype: `index.html`, `js/maps-camera.js`, `css/styles.css`, README and six screenshots, about 1.08 MB | A design reference for EA-12, opened directly in a browser. **Nothing in `frontend/` or the build reads it**, and it adds nothing to the bundle |

**Verification at the head of this branch:** `npm test -w @eldritch-alley/frontend` 643/643 in 51 files;
`npm test -w @eldritch-alley/engine` 200 passed with 2 todo; `npm test -w @eldritch-alley/game-server` 63/63;
`npm run typecheck` and `npx tsc -p frontend/tsconfig.json --noEmit` clean; `npm run build -w
@eldritch-alley/frontend` passes (206 kB entry plus the 1.58 MB Phaser chunk, with the size warning this
project has had since M2).

**Not verified by any test:** every drawing path. `HudScene` and `RotationView` need real Phaser and are never
instantiated in the Node suite, so the dashboard, the log's frame, the inspection sheet, the settings stepper
and the whole rotation canvas are asserted by geometry and by hand, never by execution. The manual iOS Safari
and Android Chrome passes the plan and the prototype README require are still owed. The drag-sensitivity row
is the least verified of all: layout tests pin that the three pieces touch and leave 164 px for the label, but
nothing renders the text, and Phaser does not clip it.

---

### 3. What this MR does not deliver

Deferred in the approved plans, with where each one is going:

- **DT-81**, the chips after a whole movement is spent. Needs the browser run; still open and still blocking
  EA-5's acceptance.
- **DT-80**, highlight and click disagreeing on reach with an empty magazine — closes with EA-14, which also
  brings mana. The inspection sheet's mana row is real only from there.
- **DT-88**, the full-canvas texture uploaded on every frame of a rotation (about 27 uploads per turn, never
  measured on a device). **DT-89**, the low-poly look of the animation, is in the backlog behind it.
- **DT-58**, the back views of the sprites.
- **The split of EA-8 out of this branch** (DT-85). The owner decides; nothing was split.
- Hover translucency under the cursor, and the touch and mobile versions of the camera, as noted above.

---

### 4. Notes for the reviewer

- **This MR has several subjects.** The camera (EA-12), the smoke test 2 HUD feedback and a batch of debts are
  in one branch, which is exactly what DT-85 records against rule 5 of `CLAUDE.md`. The five commits already
  follow the subjects: hit testing and click resolution, the sprite billboard, the dashboard reshape, the
  camera and layout, and the drag setting last. Splitting the branch is an owner decision, not a fix.
- **A cut building is drawn at two levels but is still four for the rules.** Picking a cell and placing a unit
  both use the true level, so a tap on a cut roof resolves against the full height. This is intended — the
  cutaway is display only — but it is the first thing that reads as a bug.
- **`frontend/src/view/camera.ts` is now dead weight.** The branch did not touch it, and `camera-math.ts`
  supersedes it, but it still exports a `MAX_ZOOM` of 2.5 that contradicts the delivered 1×–4×, and only its
  `CameraView` type is still imported. Its own test is what keeps it green. Worth a small follow-up.
- **Three deliberate behaviours worth not re-litigating:** pinch zoom is fractional while the fingers move and
  snaps to a whole step when one lifts, because fractional zoom leaves seams in pixel art; the default drag
  sensitivity of 50 % is a live change, so the map now moves half as far as the finger where it used to move
  1:1; and the log keeps six lines, dropping older ones for good.
- **Known rough edges in the gesture module**, none of them tested: after a pinch, the finger that stays down
  cannot pan until it is lifted and pressed again, and the right button during a pinch is read as an inspect.
- The settings panel and the inspection window were moved from where earlier plans put them; the reasons are
  in section 1 and in the layout comments beside the rectangles.
