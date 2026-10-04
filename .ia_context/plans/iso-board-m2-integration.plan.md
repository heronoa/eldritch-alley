# Plan — Isometric board, M2: integration (blocks, units on the board, highlights, overlay HUD, clicks)

**Milestone:** m2-integration
**Parent feature:** [iso-board.index.md](./iso-board.index.md)
**Created on:** 2026-10-04
**Status:** concluído, aguardando revisão

---

### 1. Objective

Draw the match with `view/iso.ts` and `view/layout.ts` from M1: the board as blocks in depth order, the
units standing on their cells with the sprites already delivered, the highlights as diamonds, the
effects at the right screen points, and the HUD floating over the board. Clicks go to the HUD first,
then to the board through `cellAt`. The build of `frontend/src/scenes/` must pass again at the end.

### 2. Prerequisites

- M1 approved and merged into this branch, with `frontend/src/view/iso.ts` and the new `layout.ts`.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/main.ts` | modify | Nothing changes in the config (1280×720, `FIT`, `pixelArt`). Only the `backgroundColor` stays |
| `frontend/src/scenes/BoardTiles.ts` | create | One `Graphics` per cell, depth `depthOfCell`, drawing top, left and right faces with `shade`. Redrawn only when the levels change |
| `frontend/src/scenes/MatchScene.ts` | modify | Uses `BoardTiles`; highlights per cell; clicks: HUD first (`buttonIndexAt`, then `hudRects`), then `cellAt`; units and effects get screen anchors; HUD positions from `hudRects()` |
| `frontend/src/scenes/units.ts` | modify | Anchor is a screen point from `cellToScreen(cell, level)`; `BODY_SCALE = 3`; ground marker is a diamond at the top-face centre; depth `depthOfUnit`; health bar and pips above the head |
| `frontend/src/scenes/effects.ts` | modify | Replaces `TILE_SIZE` with `TILE_W` and `TILE_H`. Offsets scaled to the iso tile. Impact sits at the top-face centre |
| `frontend/src/game/presentation.ts` | unchanged | Cues are still `move`, `attack`, `reload`, `defeat`, `remove` |
| `frontend/src/scenes/widgets.ts`, `LobbyScene.ts` | unchanged | The button and the lobby keep their current look (M3 of this feature may touch them) |

### 4. Contracts

#### 4.1 `BoardTiles`

```ts
export class BoardTiles {
  constructor(scene: Phaser.Scene, levelAt: (cell: Cell) => number);
  /** Redraws only the cells whose level changed since the last call. */
  sync(levelAt: (cell: Cell) => number): void;
  /** The level of every cell, for the scene and the units. */
  levelOf(cell: Cell): number;
}
```

- One `Phaser.GameObjects.Graphics` per cell, `setDepth(depthOfCell(cell))`.
- Per cell, in this order: left face (`shade(top, SHADE_LEFT)`), right face (`shade(top, SHADE_RIGHT)`),
  top face (`heightColor(level)`) with a 1 px `GRID_STROKE_COLOR` outline on all three.
- Left face polygon: `W`, `S`, `S + (0, h)`, `W + (0, h)`, where `h = level * HZ`. Right face: `S`, `E`,
  `E + (0, h)`, `S + (0, h)`. A level-0 cell has no faces, only the top.

#### 4.2 Highlights

- For each highlighted cell, one `Graphics` at `depthOfCell(cell) + 0.1`, filled with
  `HIGHLIGHT_*_COLOR` at `HIGHLIGHT_*_ALPHA`, drawn as the top face of that cell.
- Hidden when the mode is `inspect`, as today.

#### 4.3 Clicks (`MatchScene.handleClick`)

Order, and each step returns early when it handles the click:

1. `buttonIndexAt(point)`: if a button is hit, press that button (as today).
2. Any point inside a `hudRects()` rectangle is consumed: no board action.
3. `cellAt(point, levelOf)`: if a cell is returned, call `resolveClick` with it, as today.
4. Otherwise nothing.

Points on the canvas but outside the board and the HUD do nothing.

#### 4.4 Units (`units.ts`)

- `UnitSprite` takes the unit and a screen anchor. The anchor is `cellToScreen(position, level)`.
- Sprite: `setOrigin(0.5, 1)` at the anchor, `setScale(3)`. Feet are at the top-face centre.
- Ground marker: a diamond of half-width `TILE_W * 0.22` and half-height `TILE_H * 0.22` at the anchor,
  filled `TEAM_COLOR[team]`, outlined 1 px `PAPER_COLOR`. Bot markers keep the corner squares.
- Health bar and pips sit `BODY_HEIGHT + 6` px above the anchor.
- `slideTo(from, to)` takes two screen anchors; its duration is `movementDuration(cells)` where `cells`
  is the Chebyshev distance of the cells, not of the pixels (this is the fix for the distance divided by
  `TILE_SIZE`).
- Depth: `depthOfUnit(cell)`, with the cell of the unit at its current position, updated when it slides.

#### 4.5 Effects (`effects.ts`)

- Every point is a screen anchor passed in by the scene, never recomputed inside the effect.
- `tracer` and `missiles` run from the attacker's anchor to the target's anchor. Anchors are the
  top-face centres, minus half the sprite height so the shot leaves the figure's body:
  `anchor.y - BODY_HEIGHT / 2`.
- `sky-column` falls onto the target's top face centre.
- Impact particles scatter from the target's anchor.

#### 4.6 HUD placement (`MatchScene.create`)

- Every HUD object is placed from `hudRects()` and `layout.ts` constants. No literal coordinates.
- Carousel, action bar, unit panel, log, legend and status: as in M1 section 4.4.
- Panel fills use `PANEL_FILL` with alpha `0.94` (`setAlpha` on the frame), as the prototype's
  `--panel: rgba(19,22,34,.94)`. The alpha is passed as a constant `PANEL_ALPHA = 0.94` in `layout.ts`.

### 5. Tests planned

**Automated:**
- [ ] `npm test -w @eldritch-alley/frontend` (all `view/` and `game/` tests) passes.
- [ ] `npm run build -w @eldritch-alley/frontend` passes: `tsc --noEmit` and `vite build`.
- [ ] `grep -rn "cellToPixel\|pixelToCell\|TILE_SIZE\|BOARD_RECT\|SIDEBAR" frontend/src` finds nothing.

**Manual (owner, desktop 1440×860, server running):**
- [ ] The board reads as isometric blocks: three heights visible, left and right faces darker than the top.
- [ ] A unit on a height-2 cell stands on the block's top, not in the middle of it.
- [ ] A unit behind a block is hidden by the block (depth order), and a unit in front of a block is drawn over it.
- [ ] Every cell of the board can be clicked and selects the right unit (click the centre of each top
      face, all 64 cells; sample at least 8 of them on the tallest blocks).
- [ ] Clicking a block's side face selects the block's cell.
- [ ] The move highlight covers the cells the server allows, as diamonds, and the attack highlight covers
      the targets.
- [ ] Every HUD panel is over the board, and a click on a panel never moves a unit.
- [ ] The four buttons respond at their drawn positions (DT-30 regression check).
- [ ] A slide between two cells lasts the time of its cell count, not its pixel count.
- [ ] The Lobby still works (its button starts the match).

### 6. Dependencies

- M1 approved.
- M3 depends on this milestone being approved.

### 7. Execution steps

1. Write `BoardTiles.ts`, then replace the flat drawing in `MatchScene.drawGrid`.
2. Update `units.ts`, then `effects.ts`.
3. Rewrite `MatchScene.handleClick` and the HUD placement from `layout.ts`.
4. Run the automated checks. Then the manual list, in order. Record each result in the PR, with one
   screenshot of a match in progress.

### 8. Acceptance

- [ ] Automated checks pass.
- [ ] Manual list ticked by the owner in the PR.
- [ ] `backend/` and `protocol.ts` unchanged.
- [ ] No `console.log` in the new files.

### 9. Out of scope

- Colours, alpha beyond `0.94`, fonts and the look of the faces (M3).
- Fading tiles that cover units.
- Any change to the engine or the protocol.

### 10. Divergences recorded during execution

1. **`slideTo` takes a `Placement`, not two screen anchors** (§4.4). The rule is that the duration is
   the Chebyshev distance *of the cells*, and the depth is `depthOfUnit(cell)`; a screen point no
   longer carries either, because `TILE_W ≠ TILE_H`. `units.ts` therefore exports
   `Placement { cell, anchor }` and both `sync` and `slideTo` take it. `MatchScene.placementOf(cell)`
   builds it from `cellToScreen(cell, levelAt(cell))`.
2. **`widgets.ts` changed**, which §3 listed as unchanged: §4.6 requires the panel fill at
   `PANEL_ALPHA`, and the fill is drawn by `createPanel`. The alpha is set on the frame alone, so the
   heading and the inner line stay at full strength. The lobby's panel takes the same alpha.
3. **The effect anchors are two different points** (§4.5). `tracer` and `missiles` leave the figure's
   body (`anchor.y - BODY_HEIGHT / 2`), while `sky-column` lands on the top face. `MatchScene` picks
   the point per effect kind (`effectPoint`), which is what "passed in by the scene" requires; both
   go through the one `playEffect(scene, effect, from, to)` call. `BODY_HEIGHT` is exported from
   `units.ts` for it.
4. **Legend and status text positions.** M1 defined `LEGEND_RECT` and `STATUS_RECT` but no text
   points inside them, so the scene places the legend at the rect's top-left plus `PADDING` and the
   status at the rect's top-left. No new layout constant was invented.
5. **`HUD_DEPTH = 100` in `MatchScene`**, a constant the plan does not name. Depth is now what orders
   the scene (tiles 0–14, units 0.5–14.5), so the HUD has to be given one explicitly or the board
   would cover it; 100 clears the whole board.
6. **`BoardTiles.levelOf` is not read by `MatchScene`.** The scene keeps its own `levelAt`, because
   `BoardTiles` needs a level source *before* it exists (its constructor draws once). The method stays
   as part of the §4.1 contract.

### 11. The §5 list, as far as it can be checked without the owner

Automated (all three, run on 2026-10-04):

- `npx vitest run --root frontend` — 17 files, 187 tests, all passing.
- `npm run build -w @eldritch-alley/frontend` — `tsc --noEmit` clean, `vite build` clean.
- `grep -rn "cellToPixel\|pixelToCell\|TILE_SIZE\|BOARD_RECT\|SIDEBAR" frontend/src` — nothing.

Headless Chrome against the built client and a fresh game server (`/tmp/ea-m2.*.mjs`, throwaway):

- The board draws as isometric blocks: three levels, side faces darker than their top, grid outlined
  (screenshot of the board at 2×).
- The three units of a squad stand with their diamond markers on the top face of their own cells.
- After the bot's turn, its units stand on the raised blocks, not in the middle of them (screenshot of
  the result).
- 128 clicks — every cell centre at level 0 and at level 2 — raise no exception and leave the board
  drawn and the selection following the click (screenshot after the clicks).
- A click in each of the six HUD rectangles raises no exception (screenshot after the clicks).
- The four action buttons answer at their drawn positions; "Mover" arms and the highlight covers the
  reachable cells as diamonds (screenshot with the move highlight armed).
- "Derrota" and its stamp draw over the board and the panels.
- The lobby still starts a match.

Not checked without the owner: the attack highlight of §5 (the armed unit had no target in range in
the sample match, so "Atacar" was disabled and could not be armed), a unit hidden by a block in front
of it, and the slide lasting its cell count. M3 is blocked on the owner's approval of this milestone.
