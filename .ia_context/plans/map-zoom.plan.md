# Plan — Map zoom in and out, with the HUD in its own scene

**Milestone:** single plan
**Created on:** 2026-10-04
**Status:** concluído em 2026-10-04 (option A, chosen by the owner). Checked in headless Chrome: the map zooms, the HUD keeps its size, no console errors.
**Backlog item:** DT-67 (zoom part only; rotation stays in the backlog)

---

### 1. Objective

The player can zoom the board in and out with the mouse wheel and with `+` / `-`, around the point under the cursor, while the HUD keeps its size. This needs the HUD to leave the match scene: a camera zoom would enlarge the panels too.

### 2. Decisions

- Zoom range: 1× (the whole board, the start) to 2.5×. Zoom steps by 1.15× per wheel notch and by 1.25× per key press.
- The zoom keeps the point under the cursor in place, and the camera centre is clamped to the board's bounds.
- The HUD becomes a second scene, `HudScene`, drawn above the match scene and never zoomed. The match scene keeps every click and the game logic; the HUD scene only draws what it is given.
- Clicks on the board use the world position of the pointer (zoom-aware); clicks on the HUD use the screen position, as now.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/camera.ts` | create | Pure: `zoomAbout` and `clampCentre` (section 4.1) |
| `frontend/src/view/camera.test.ts` | create | Keeps the cursor point fixed, clamps, respects the zoom range |
| `frontend/src/scenes/HudScene.ts` | create | The HUD: panels, carousel, action bar, unit panel, log, legend, status, result, stamp, way out. Draws a `HudView` it is given |
| `frontend/src/scenes/MatchScene.ts` | modify | Launches `HudScene`; builds the `HudView` from its state and pushes it; zoom input; world clicks |
| `frontend/src/main.ts` | modify | Adds `HudScene` to the scene list, after `MatchScene`, so it draws above it |

### 4. Contracts

#### 4.1 Camera (pure)

- `zoomAbout(view, cursor, canvasCentre, factor, bounds)`: `view` is `{ zoom, centre }`. Returns the new view with `zoom` multiplied by `factor` and clamped to `[1, 2.5]`. The world point under `cursor` before the zoom stays under it after. The new centre is clamped to `bounds`.
- `clampCentre(centre, zoom, bounds, canvas)`: the visible part of the world stays inside the board's bounds; when the visible part is larger than the bounds on an axis, the centre is the bounds' middle on that axis.

#### 4.2 HudScene

- `render(view: HudView)`: `HudView` = `{ state: PublicState | null; selectedId; mode; finished; buttons: ActionButton[]; logLines: string[]; status: string; statusAlert: boolean; result: string; wayOutVisible: boolean }`.
- Before `create()` runs, `render` keeps the last view and applies it on create.
- On shutdown, the scene removes its own objects, so a new match starts clean.

#### 4.3 MatchScene

- `create()` launches `hud` after its own setup. `SHUTDOWN` stops `hud`.
- Keeps `logLines`, `statusText`, `resultText`, `finished`, `mode`, `selectedId` as fields and calls `pushHud()` after each change.
- Wheel: `zoomAbout` with `factor = 1.15` for a wheel-up notch (zoom in) and `1 / 1.15` for wheel-down. Keys `+`/`=`/numpad `+` zoom in, `-`/numpad `-` zoom out, around the canvas centre, factor 1.25.
- `handleClick`: the HUD tests use `pointer.x/y` (screen); the board uses `pointer.worldX/worldY`.

### 5. Tests planned

- [ ] `camera.test.ts`: the point under the cursor stays under it after a zoom in and after a zoom out (same screen position, within 1 px); the zoom never goes below 1 or above 2.5; the centre is clamped to the bounds; at zoom 1 the centre is the bounds' middle.
- [ ] Automated: `npm test -w @eldritch-alley/frontend`, `npx tsc --noEmit` in `frontend/`, `npm run build -w @eldritch-alley/frontend`.
- [ ] Manual: the wheel and the keys zoom around the cursor; the HUD keeps its size at 2.5×; a click on a unit at 2× selects it; the action bar still responds at 2×; the way out still works after a match; a second match after leaving shows no HUD left over from the first.

### 6. Out of scope

- Rotation (backlog DT-67).
- Panning with the mouse drag (not asked; the clamp already keeps the board in view).
- Zoom persistence between matches.
