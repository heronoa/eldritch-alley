# Plan — Quick wins, M2: client (effects on top of the board, a way out, dead units, portraits in the queue)

**Milestone:** m2-client
**Parent feature:** [debt-quick-wins.index.md](./debt-quick-wins.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Five debts, all in `frontend/`, each a few lines:

- **DT-44:** attack effects are drawn beneath the board's blocks. Give them a depth above the board.
- **DT-47 (partial):** a constant test of that depth, which runs in Node. The scene-level test stays open.
- **DT-52:** the turn queue shows a letter. It shows the unit's sprite instead.
- **DT-59:** after "Vitória" or "Derrota" the player has no way out. Add a button that goes back to the lobby.
- **DT-24:** a permanently removed unit still counts as an occupant on the client, and its ghost is drawn.

### 2. Prerequisites

- The visual identity branch and the isometric board are in the branch (as in the index).
- M1 is **not** required. M2 changes no backend file.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/iso.ts` | modify | Adds `EFFECT_DEPTH = 20` and `BOARD_TOP_DEPTH` = `depthOfUnit({x: 7, y: 7})` (14.5), with a comment on the layer order (section 4.1) |
| `frontend/src/view/iso.test.ts` | modify | Asserts `EFFECT_DEPTH` is above every board object and below the HUD (section 5) |
| `frontend/src/scenes/effects.ts` | modify | Every object created by an effect gets `setDepth(EFFECT_DEPTH)` (4.1) |
| `frontend/src/scenes/MatchScene.ts` | modify | Result button (4.2); skips `permanentlyDead` units in `redrawUnits` (4.3) |
| `frontend/src/view/unit-look.ts` | modify | `chipFrameOf(unit): number` (4.4) |
| `frontend/src/view/unit-look.test.ts` | modify | Covers `chipFrameOf` |
| `frontend/src/scenes/widgets.ts` | modify | `createTurnChip` draws the sprite frame instead of the initial (4.4) |
| `frontend/src/net/session.ts` | modify | `close()` leaves the room without firing `onDrop` (4.2) |
| `frontend/src/net/session.test.ts` | modify | Covers `close()` (section 5) |
| `frontend/src/game/selection.ts` | modify | `occupantOf` ignores `permanentlyDead` units (4.3) |
| `frontend/src/game/selection.test.ts` | modify | A permanently removed unit does not block a move onto its tile |
| `frontend/src/view/layout.ts` | modify | `RESULT_BUTTON_RECT` (4.2); `HUD_DEPTH = 100` moves here from `MatchScene.ts`, exported |
| `frontend/src/view/layout.test.ts` | modify | The result button is inside the canvas and clear of the carousel and the action bar |

Not touched: `backend/`, `protocol.ts`, the engine, the look of the board and the HUD apart from the chip.

### 4. Contracts

#### 4.1 DT-44 — depth of the effects

- `EFFECT_DEPTH = 20`: above every board object (the highest is a unit on (7,7), at depth 14.5) and below
  `HUD_DEPTH = 100`.
- Every object `effects.ts` creates is given `.setDepth(EFFECT_DEPTH)`. The six sites are the rectangle
  of the square, the graphic of the line, the column, the arcs graphic, the dart rectangle and the particle
  rectangle.
- Effects are destroyed when done, as today, so no depth leaks.

#### 4.2 DT-59 — a way out of the match

- `RESULT_BUTTON_RECT` in `layout.ts`: `{ x: 540, y: 440, width: 200, height: 56 }`, centred on the canvas,
  under the result text. It sits over the finished board, which is acceptable because the match is over.
- In `handleEnded`, a `Button` with the label `Voltar ao início` is created at `RESULT_BUTTON_RECT`, with
  `setDepth(HUD_DEPTH)`. Its press calls `this.leave()`.
- `leave()`:
  1. `this.session.close()`.
  2. `this.scene.start('lobby')`.
- `Session.close()`: sets a flag so the room's leave is not treated as a drop, calls `room.leave()`, clears
  its room reference. Calling it twice does nothing.
- The lobby is created again on the next start, with a new session on the next press. Nothing else is kept.
- The button exists only after `handleEnded`. Clicks on it go through the same `buttonIndexAt` order as the
  action bar: the result button is checked before the board. Add it to the hit-test list in `handleClick`.

#### 4.3 DT-24 — dead units

- `occupantOf` in `selection.ts` returns `undefined` for a unit with `permanentlyDead: true`. A corpse that
  still lies on its tile (`defeated` and not `permanentlyDead`) still occupies it, as the server does.
- `redrawUnits` in `MatchScene` does not create or keep a sprite for a `permanentlyDead` unit, so no ghost
  is drawn.

#### 4.4 DT-52 — the queue with portraits

- `chipFrameOf(unit)` returns `frameIndex(classRow(unit.primaryClass) ?? 0, 0)`: the idle frame of the class,
  in its row. Unknown classes fall back to row 0, as the unit sprite does.
- `createTurnChip` (in `widgets.ts`) draws, inside the chip:
  - the same team background as today (`fillColorOf(unit)`);
  - a `Phaser.GameObjects.Sprite` on the texture `unit-${spriteSheetOf(team)}` at frame `chipFrameOf(unit)`,
    `setScale(2)`, centred in the 96×64 chip;
  - the current-turn ring as today.
- The initial letter is removed from the chip. For a fallen unit, the sprite is tinted `CORPSE_COLOR`.
- The sprite textures are loaded by `BootScene`, so they exist when the chips are drawn.

### 5. Tests planned

**`iso.test.ts`**
- [ ] `EFFECT_DEPTH > BOARD_TOP_DEPTH` (14.5) and `EFFECT_DEPTH < HUD_DEPTH`. `HUD_DEPTH` moves from `MatchScene.ts` to `view/layout.ts` (exported) so this test reads both values.
  This closes the constant part of DT-47. The scene part stays open in DT-47.

**`session.test.ts`**
- [ ] `close()` leaves the room and does not report a drop.
- [ ] `close()` twice does not throw and does not leave twice.
- [ ] After `close()`, `send` does nothing.

**`selection.test.ts`**
- [ ] A unit with `permanentlyDead: true` on a cell does not block a move onto that cell.
- [ ] A unit with `defeated: true` and `permanentlyDead: false` still blocks it.

**`unit-look.test.ts`**
- [ ] `chipFrameOf` on a sniper is `frameIndex(3, 0)`; on an unknown class is `frameIndex(0, 0)`.

**`layout.test.ts`**
- [ ] `RESULT_BUTTON_RECT` is inside `1280 × 720`, and does not intersect `CAROUSEL_RECT` or `ACTION_BAR_RECT`.

**Manual (owner, desktop, server running):**
- [ ] An attack that lands on a target behind a raised block shows its effect over the block (DT-44).
- [ ] At the end of a match, "Voltar ao início" appears. Pressing it shows the lobby with its button working.
- [ ] Starting a second match from there plays normally, and one click produces one action (no duplicated handler).
- [ ] The server log shows the leave, and no "Partida perdida" or reconnection notice appears after leaving.
- [ ] A unit that is removed after its corpse expires leaves no ghost on its tile (DT-24).
- [ ] Each chip in the turn queue shows the unit's sprite in its team colour; a fallen one is grey.
- [ ] A move onto the tile of a removed unit is accepted on the client too.

### 6. Dependencies

- None.
- DT-47 stays open for its scene part. DT-41 (scene tests) stays open.

### 7. Execution steps

1. Write the tests of section 5 first; see them fail.
2. `iso.ts` and `effects.ts` (DT-44).
3. `session.ts` `close()`, then the result button and `leave()` in `MatchScene` (DT-59).
4. `selection.ts` and `redrawUnits` (DT-24).
5. `unit-look.ts`, `widgets.ts` (DT-52).
6. Run `npm test -w @eldritch-alley/frontend`, `npx tsc --noEmit` in `frontend/`, and `npm run build -w @eldritch-alley/frontend`.
7. Run the manual list. Record each result in the PR.

### 8. Acceptance

- [ ] Automated checks pass.
- [ ] Manual list ticked in the PR.
- [ ] `technical-debt.md`: DT-44, DT-59, DT-24 and DT-52 moved to the Closed table with their resolution; DT-47 updated to say only its scene part is open.

### 9. Out of scope

- Fading tiles that hide units (DT-55).
- The sniper's sound and any audio (DT-56).
- A "play again" button that starts a match without going through the lobby.
- Scene-level depth tests (DT-47 scene part, DT-41).
- The turn queue with portraits (DT-52): a feature, now in `backlog.md`.
