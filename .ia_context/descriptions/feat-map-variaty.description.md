# MR — Prototype maps in the match, map zoom, and debt fixes

**Branch:** `feat/map-variaty`
**Base branch:** `develop`
**Milestone:** M2-a (client), map fidelity, zoom
**Ticket(s):** —
**Date:** 2026-10-04

---

### 1. What this MR delivers

Each match now plays on one of the three maps of the prototype (`street`, `park`, `roof`), drawn the way the prototype
draws them: the same tiles and colours, the exact heights, the props, the sky and the moon, in pixel-art proportions at
2×. The server picks the map from the match seed and sends its id with every state message, so the client draws the
map it was given. The player can zoom the board with the mouse wheel or the `+` / `-` keys, from the whole board to 2.5×,
and the HUD stays at its size, because it now lives in its own scene. Two debts that the review of this work found are
fixed: a click on the side of a wall now lands on the wall (DT-61), and the two copies of the map data are compared
directly by a test (DT-62).

**Divergences from the approved plans, named explicitly:**

- **`map-variety` is superseded.** Its four milestones delivered a 10×10 layout with four height tones, which did not
  look like the prototype. The owner asked for the prototype's look, and `map-fidelity` replaces it. The random draw and
  the spawn rules of `map-variety` stay. `map-variety.index.md` is marked "partially delivered; superseded".
- **The spawns are the prototype's demo positions,** not the corners of the map the `map-variety` plan used. The corners
  of `street` are buildings, so the prototype's own positions were the honest choice. Reachability is tested on every map.
- **The renderer does not copy the prototype's placeholder figures** (14×17). It keeps the sprites of the visual identity,
  drawn at 2×, so the unit sprite scale went from 3 to 2 to match the map's pixel grid.
- **The prototype's demo overlays are not part of the map:** the red threat line, the demo units, and the move and attack
  highlights. The match draws its own.
- **The HUD moved to its own scene (`HudScene`).** This was not in the zoom plan's first sketch, but it is the only way a
  camera zoom leaves the panels at their size. The HUD draws what the match scene hands it and reads no state itself.
- **The M3 checklist of the map fidelity plan is not ticked in the repository.** The owner smoke-tested the three maps and
  approved them in conversation; the item-by-item record is still to be written in the screenshot README.

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `backend/game-server/src/maps/prototype-maps.ts` | The three maps as data: tiles, exact heights, voids, props, lift, sky, spawns | The board is the prototype's board. The values were checked against the prototype's own loader, cell by cell |
| `backend/game-server/src/map.ts` | `MAPS` built from the prototype data; `boardOf` turns voids into level 0; spawns are the map's own | The engine gets a board it accepts; its rules are unchanged |
| `backend/game-server/src/map.test.ts` | Reachability with the eight-neighbour step rule; an exact list of unreachable cells per map | Cells that cannot be reached are a reviewed list, not a silent gap (DT-48) |
| `backend/game-server/src/protocol.ts`, `battle-room.ts` | `PROTOCOL_VERSION = 3`; the state message carries `mapId` | The client knows which map to draw |
| `frontend/src/maps/*` | The client's copy of the map data and the palette, with a test against the server copy | Both sides draw the same map (DT-62 closed) |
| `frontend/src/scenes/map/MapView.ts`, `cell.ts`, `props.ts`, `backdrop.ts`, `random.ts` | The prototype's drawing ported: sky, skyline, moon, facades, parapets, props; one canvas per cell | Units can stand between cells, as they do in the prototype |
| `frontend/src/view/iso.ts` | Projection at 2× (`TILE_W = 64`, `TILE_H = 32`, `HZ = 16`); `cellAt` in one front-to-back pass | A click lands on the cell the player sees, including a wall's side face (DT-61) |
| `frontend/src/view/camera.ts` | Zoom about a point and clamping of the centre, as pure functions | Tested in Node; the scene only applies the result |
| `frontend/src/scenes/HudScene.ts` | The whole HUD, drawn from a `HudView` | The panels keep their size while the map zooms |
| `frontend/src/scenes/MatchScene.ts` | Launches the HUD; zoom input (wheel and keys); board clicks in world space, HUD clicks in screen space | The board can be zoomed and clicked at any zoom |
| `frontend/src/main.ts` | `HudScene` added after `MatchScene` | It draws above the map |
| `frontend/src/scenes/units.ts` | `BODY_SCALE` is 2 | Units match the map's pixel grid |
| `frontend/src/scenes/BoardTiles.ts` (deleted), `grid.ts` | The old three-tone board and `heightColor` removed | No second source of colour for the board |
| `.ia_context/inputs/*` | Debt split into open, closed and backlog; DT-61, DT-62, DT-63 and DT-65 closed; DT-64 measured; DT-60 reproduced | The debt list tells the truth about what is still open |
| `.ia_context/plans/map-zoom.plan.md` | The plan for zoom, option A | The decision and its limits are written down |

### 3. What this MR does not deliver

- Rotating the map (backlog DT-67). Zoom only.
- Panning by dragging. The zoom clamp keeps the board in view, which is enough for the first version.
- Zoom persistence between matches.
- The title screen (`title-screen` plans). It stays in its own branch, as decided.

### 4. Notes for the reviewer

- **Stacked on `develop`:** the visual identity branch was merged in PR #8, so this MR is only the map work and the zoom.
- **Commit messages are misleading in one place:** `611df32` and `5e7a82f` are titled "implement map variety", and they carry
  the map-fidelity code, which replaces the variety plan. The description above is the reading to use.
- **Known open items, all in the debt list:**
  - DT-60: after a refresh mid-match, the lobby does not return to the battle; the next match fails with "Servidor
    indisponível". Reproduced during the DT-64 measurement.
  - DT-64: the memory of one match is about 29 MB of canvas (one valid sample). Growth across matches is not measured yet,
    because of DT-60.
  - DT-66: the `room full` error is printed by the server test suite.
  - DT-47 (partly) and DT-41: no scene-level test for the depth order, the HUD scene or the zoom.
- **Measured, not guessed:** the cost of one match and the frame rate under software rendering. The frame rate is not a
  measure of a real browser.
- **Tests:** engine 122 passing; game-server 57 passing (6 files); frontend 250 passing; typecheck and build pass on
  Node 22. The server tests refuse to start on Node below 22, with a clear message (`.nvmrc` pins 22).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
