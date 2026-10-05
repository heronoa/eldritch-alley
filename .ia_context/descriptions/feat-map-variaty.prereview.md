# Pre-review — Prototype maps in the match, map zoom, and debt fixes

**Branch:** `feat/map-variaty`
**Generated on:** 2026-10-04

---

### 1. What to test

Automated first. Use Node 22 (`nvm use` reads `.nvmrc`); the server tests stop with a clear message on Node 18.

- **Whole suite from the root:** `npm test` (expect engine 122, game-server 57, frontend 250, all passing).
- **Typecheck:** `npm run typecheck` (engine, game-server and platform-api), and `npx tsc --noEmit` inside `frontend/`.
- **Build:** `npm run build` (expect "built in" for the frontend, no errors).

Manual, in a browser at 1280×720, with the game server running:

- **Each map, drawn as the prototype:** start a match several times until each of the three maps has appeared
  (`street` with its shop fronts and fence, `park` with trees, a fountain and a hill, `roof` with its parapet, its gap with
  the plank, and its moon). Compare with the prototype's screenshots in
  `.ia_context/prototypes/eldritch-alley-map-prototype/screenshots/`. Empty state: none; there is always a map.
- **Units on the map:** each unit stands on ground, not inside a block; a block in front of a unit hides it; a unit
  behind a block is not drawn over it.
- **Clicks on a wall (DT-61):** with a unit selected and "Mover" armed, click the visible side face of a raised block.
  The cell that gets highlighted or targeted is the block's cell, not the flat cell behind it.
- **Zoom:** the mouse wheel zooms around the cursor, from the whole board to 2.5×. `+` and `=` zoom in, `-` zooms out.
  At 2.5× the board is larger, and the HUD panels, the action bar, the carousel, the log and the legend keep their
  size and their place.
- **Clicks at zoom:** at 2× and 2.5×, select a unit by clicking its sprite; move it by clicking an adjacent cell; press
  "Atacar" and click an enemy. Each click acts on the cell the pointer is over.
- **HUD clicks at zoom:** at 2.5×, press each of the four action buttons where they are drawn. Each responds.
- **Way out:** finish a match, then press "Voltar ao início". The lobby opens. Start a second match: its map is drawn
  fresh, the HUD shows no leftover from the first match (no old log, no old result, no old stamp), and the zoom starts at
  the whole board.
- **Known defect, expected to fail (DT-60):** reload in the middle of a match, then press play in the lobby. The lobby
  shows "Servidor indisponível" instead of returning to the battle. Do not count it against this MR.

---

### 2. Code checklist

- [ ] No `console.log` or debug output in the new files (`frontend/src/scenes/HudScene.ts`, `frontend/src/view/camera.ts`,
      `frontend/src/scenes/map/*`, `frontend/src/maps/*`, `backend/game-server/src/maps/*`)
- [ ] `backend/engine/` unchanged (`git diff develop -- backend/engine/` is empty)
- [ ] `PROTOCOL_VERSION` is 3 on both sides, and both `StateMessage` types carry `mapId`
- [ ] The map data in `frontend/src/maps/prototype-maps.ts` equals the server copy (the frontend test compares them)
- [ ] `technical-debt.md` and `technical-debt-closed.md` agree: DT-61, DT-62, DT-63 and DT-65 are closed; DT-60, DT-64 and DT-66 are open
- [ ] The `KNOWN_UNREACHABLE` lists in `backend/game-server/src/map.test.ts` are the ones the owner reviewed

---

### 3. Behaviour checklist

**Maps**

- [ ] Each of the three maps is drawn as the prototype draws it, with its own sky
- [ ] The roof's gap is void: no floor, and no unit can walk into it
- [ ] Units spawn on ground of their own side, and the two squads can meet across the map

**Zoom and HUD**

- [ ] The wheel and the `+` / `-` keys zoom; the zoom stops at the whole board and at 2.5×
- [ ] The HUD keeps its size at every zoom
- [ ] A click on the board at zoom selects or acts on the cell under the pointer

**Finish and leave**

- [ ] "Voltar ao início" returns to the lobby, and a new match after it starts clean
