# Plan: Smoke test 2 feedback, HUD dashboard and technical debt

**Milestone:** lot 3 (before the AWS staging deploy)
**Parent feature:** Smoke test 2 (camera feature, branch `fix/camera-controls`)
**Requires:** EA-12 (camera, rotation), EA-6 (inspection gesture), EA-8 (target by figure)
**Created:** 2026-10-06
**Status:** approved by the owner on 2026-10-06. Section 6 records the decisions. Ready for execution.

## 1. Objective

Fix what the owner saw in the second smoke test and pay the open debts that touch the same code. Three things the owner asked for, in the owner's words:

1. The units look the same before, during and after a rotation.
2. The HUD stops covering the board: the unit's data becomes a dashboard along the bottom edge, and the log becomes small or collapsible.
3. Clicking to inspect a unit opens a window with the unit's specifications, closed with an X.

The low-poly rotation drawing is not in this plan. It is in the backlog as DT-89.

## 2. Findings

Each finding is evidence from the code as it is on the branch.

- **F1 · Units change look during a rotation.** `RotationView.drawFigure` draws a flat rectangle in the team colour (`frontend/src/scenes/map/RotationView.ts:160-176`). The unit's sprite is drawn only at rest (`frontend/src/scenes/units.ts`, `frontend/src/view/unit-look.ts`: frame 16×24, scale 2, sheets `ally` and `enemy`). The owner expected the same figure.
- **F2 · Cost of using the sprite in the rotation.** The sheets are already loaded as Phaser textures, so there is no new download. A figure is one `drawImage` of a 32×48 frame at scale 2, and the mirror is a canvas transform. A match has at most six units, so the figures add a few draw calls per frame. This is an estimate, not a measurement. The current cost of a turn is the full redraw of the board on every frame, plus the upload of the whole canvas (DT-88). That redraw dominates the figures.
- **F3 · The HUD looks too big after the camera moves.** The HUD has its own scene and camera (`frontend/src/scenes/HudScene.ts` has no `setZoom`), so it is not scaled. It looks big because two 300 px columns are always drawn over the board: the unit panel on the left (`PANEL_RECT`, `frontend/src/view/layout.ts:57`), and the log on the right (`LOG_RECT`, `layout.ts:72`). The camera panel stacks below the log (`CAMERA_RECT`, `layout.ts:337`).
- **F4 · The unit panel is already a pure model.** `frontend/src/game/panel.ts` (`unitPanel`) produces the rows HP, movement, action, ammunition, reaction and mana, with the labels in `panel.label.*`. The rendering is the only part to move.
- **F5 · The action bar and the chips are placed by the bar's y.** The bar is at `y 648` (`layout.ts:51`), the chips at `bar.y - 32` (`layout.ts:160`) and the end-turn hint at `bar.y - 64` (`layout.ts:186`). Moving the bar moves all of them, so they have to be computed from one place.

## 3. Changes by slice

One slice is one commit, following rule 5 of `CLAUDE.md`. The tests of a slice are in the same slice. Frontend only: the engine and the server do not change in any slice.

### Slice A · Units keep their look through a rotation (F1, F2)

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/unit-look.ts` | modify | The choice of the frame a unit is drawn with, moved here from `units.ts` if it is there, so the rest drawing and the rotation read the same function. Pure |
| `frontend/src/scenes/map/RotationView.ts` | modify | `drawFigure` draws the unit's frame from its sheet with `drawImage`, mirrored when `facesRight` says so (`frontend/src/view/billboard.ts`). The sheet is read from the scene's textures |
| `frontend/src/view/unit-look.test.ts` | modify | The frame of the rotation equals the frame at rest, for every class and team |
| `frontend/src/view/billboard.test.ts` | modify | The mirror of the rotation equals the sprite's own `setFlipX` at rest, for the four views |

**Acceptance.** Owner's smoke test: the same figure before, during and after a turn.

### Slice B · The bottom dashboard (F3, F4, F5, DT-83)

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/layout.ts` | modify | A dashboard rectangle along the bottom edge. The action bar stays centred. A left cell holds the HP bar, a right cell holds the ammunition (or mana), and a line under the buttons holds `Movimento · Ação · Reação` in a minimal form. The chips and the end-turn hint are placed from the new bar's y, not from a constant |
| `frontend/src/scenes/HudScene.ts` | modify | `drawPanel` renders the unit's data in the dashboard instead of the left column. The left column is freed |
| `frontend/src/game/panel.ts` | no change | The model stays. The rows the dashboard shows are the same rows |
| `frontend/src/view/layout.test.ts` | modify | Every dashboard part is inside the canvas. No two parts overlap. `buttonIndexAt` still matches `buttonRect` (DT-30). The chips sit above the bar |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | Labels of the minimal line, in both languages (the English catalog is complete by type) |

**Layout budget.** The canvas is 1280×720 (`layout.ts:18-19`). The bar today ends at 704, which leaves 16 px. The dashboard needs about 96 px, so the bar moves up. The exact rectangles are `layout.ts`'s to set, and the tests in this slice are what fix them.

**DT-83.** The chips get a height and padding that fit their labels (`Confirmar`, `Cancelar`), which the owner already set in the catalog.

**Acceptance.** Owner's smoke test: the unit's data sits along the bottom, the board is not covered on the left, and the chips are readable.

### Slice C · The log: small, above the buttons, collapsible (smoke spec)

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/layout.ts` | modify | The log is a small box over the bar, with a header that holds a toggle. Collapsed it shows one header line. Open it shows the last lines, and the number of lines is the one fixed by `LOG_LINES` |
| `frontend/src/scenes/MatchScene.ts` | modify | A `logOpen` flag, read in `hudTakesPress` before `hudRects`. The toggle is a HUD rectangle, so a click on it is not a board click |
| `frontend/src/scenes/HudScene.ts` | modify | Draws the box in the collapsed or open form, and the toggle's glyph |
| `frontend/src/game/log.ts` | no change | The sentences do not change |
| `frontend/src/view/layout.test.ts` | modify | The toggle and the open box lie over the board, not over the dashboard |

**Acceptance.** Owner's smoke test: the log is small by default, opens and closes with the toggle, and does not hide the bar.

### Slice D · Camera panel (F3)

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/layout.ts` | modify | With the log moved, the camera panel takes the right column from the top. Its controls, its maths and its behaviour do not change |

**Acceptance.** No overlap with the log of Slice C, and the controls work as before.

### Slice E · The unit inspection window (smoke spec)

| File | Operation | What changes |
|---|---|---|
| `frontend/src/game/inspect-window.ts` | create | Pure: the rows of the window for a unit, from the public state. Rows, as the owner chose (Q5): HP over the maximum; ammunition over the magazine (a row only for a class with a magazine); mana (a row only once the engine has mana, DT-57); maximum movement per turn; reactions. Reactions: the engine gives each unit one reaction slot (`frontend/src/types.ts` is `backend/engine/src/types.ts:36`, `reaction: string | null`), so the row reads the slot as filled or empty, and a count above one needs an engine change first. Nothing else is shown |
| `frontend/src/game/inspect-window.test.ts` | create | The rows for each class, a unit with no magazine, a unit with equipment in one slot, and a defeated unit |
| `frontend/src/scenes/HudScene.ts` | modify | Draws the window over the board when a unit is inspected, with a close button `X` at its top right |
| `frontend/src/scenes/MatchScene.ts` | modify | The `X` clears `inspectedId`. A press inside the window is taken by the window and never reaches the board. The board click closes the window as it does today (EA-6) |

**Contract.** The window sends no action, changes no turn and selects nobody (EA-6, D2). The highlight of the inspection stays as it is: the window is in addition to it.

**Acceptance.** Owner's smoke test: right-click (or long press) opens the window, `X` closes it, the highlight returns to the state's own.

### Slice F · Debts that touch these files (see section 5)

Resolved in this plan: DT-79, DT-81, DT-82 (verify), DT-84, DT-86, DT-87, DT-72 (close as obsolete). Each has its own test or check in section 5.

### Slice G · Gesture rules as a pure module (DT-84)

| File | Operation | What changes |
|---|---|---|
| `frontend/src/game/press.ts` | create | Pure: the rules of a press. A tap under the slop, a drag, the long press, the second finger of a pinch, and `pointercancel`. The scene asks it and does what it answers |
| `frontend/src/game/press.test.ts` | create | Each rule, including a second finger, a cancel mid-drag, and a long press released after it was answered |
| `frontend/src/scenes/MatchScene.ts` | modify | The handlers call `press.ts`. No behaviour changes except what the tests reveal |

## 4. Contract of the layers

- The frontend is the only layer that changes. No engine change, no protocol change. A protocol change would need a version bump (ADR 0010); if one seems needed, stop and ask.
- The sprite drawn in a rotation is the sprite drawn at rest, from the same sheet and frame choice.
- The inspection window never sends an action.
- The dashboard's buttons are hit-tested with the same rectangles they are drawn with (DT-30).

## 5. Technical debts

| Debt | Action in this plan | Slice |
|---|---|---|
| DT-79 · Test for the inspection gesture | Resolve: the rules move to `press.ts` and are tested | G |
| DT-80 · Reach and click disagree with an empty magazine | Defer: closes with EA-14. Not in this plan | — |
| DT-81 · Chips vanish after the whole movement is spent (serious bug) | Resolve: reproduce in the browser first (see section 8, step 4) and fix the cause; add a test of the chips' rule over the full-spend state | F |
| DT-82 · Attack disabled without an enemy in reach (serious bug) | Verify and close: the change is in `frontend/src/game/actions.ts` (`canAttack` by the attack area). Confirm with the test `offers the attack when cells are in reach` and close it in the bank | F |
| DT-83 · Chips have no padding | Resolve in Slice B | B |
| DT-84 · Pointer, pinch and rotation driving have no test | Resolve in Slice G | G |
| DT-85 · EA-8 is in the camera branch | Owner decision, not a task for this plan: whether to split it out. Do not split or commit | — |
| DT-86 · A tap during a rotation resolves against the old view | Resolve: no board press while `this.turn !== null`, with a test of the rule | F |
| DT-87 · No test that a rotation leaves the engine unchanged | Resolve: a test that the view functions do not change the match state | F |
| DT-88 · Full-canvas texture uploaded every frame of a rotation | Defer: measure on a device first; the trigger stays | — |
| DT-72 · Preview of the first tap has no path or cost | Close as obsolete: the destination tap now sends the move, so there is no first tap to preview. Move it to the closed list | F |
| DT-89 · Low-poly rotation animation | Backlog, not this plan | — |

## 6. Decisions still open (owner)

- **Q1 · Countdown after the whole movement is spent.** Decided: keep it. A pending move keeps the countdown from starting until Confirmar (EA-5).
- **Q2 · Which frame the rotation draws.** Proposed: the idle frame of the unit's class, which is the same at rest. Alternative: the frame the unit is in at that moment.
- **Q3 · The log by default.** Decided: closed, with its header and the last line visible.
- **Q4 · How the inspection window closes.** Decided: the X only. Consequence to confirm with the owner: while the window is open, its highlight stays on the board, so the player's own move or attack highlight is hidden until the X is pressed. A press on the board still acts as usual.
- **Q5 · The specifications in the window.** Decided: HP, ammunition or mana, maximum movement, and reactions (Slice E).

All five decisions are recorded. Every slice can start.

## 7. Out of scope

- The low-poly drawing of the rotation (DT-89).
- Reach and click with an empty magazine (DT-80, EA-14).
- Mana: the engine has none (DT-57). The dashboard shows the mana row only where the panel model already gives one.
- Back views of the sprites (DT-58).
- Audio.
- The split of EA-8 (DT-85).

## 8. Execution order for the deepseek

1. Read this plan, `CLAUDE.md` and the files each slice names. Git: read-only commands only; leave the changes uncommitted and propose a split by slice with a Conventional Commits message for each (`CLAUDE.md`, Git section).
2. Start with the slices that do not depend on section 6: DT-82 and DT-87 (small), then Slice A, Slice G, and Slice B with DT-83.
3. Then Slices C, D and E.
4. DT-81 needs the browser. Add the logging described in `.ia_context/inputs/technical-debt.md` (DT-81), run the match with `npm run dev:frontend` and `npm run dev:game-server`, and check the state after a full-budget move. If you cannot run the browser, stop on DT-81, say so, and do the rest.
5. Each slice ends with:
   - `npm run typecheck`
   - `npx tsc -p frontend/tsconfig.json --noEmit`
   - `npm test -w @eldritch-alley/engine`
   - `npm test -w @eldritch-alley/frontend`
   - `npm test -w @eldritch-alley/game-server` under Node 22, because the server's config refuses Node 18 (`npx` picks the shell's Node; if it is 18, run with the nvm Node 22 binary)
6. Update the technical debt bank when a debt is resolved: move it to `.ia_context/inputs/technical-debt-closed.md` with the resolution, and keep the open list accurate.
7. Report per slice: what changed, the test output, and what the owner should check in the smoke test. Do not mark a slice done without its tests green.
