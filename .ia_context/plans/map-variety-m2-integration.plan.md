# Plan — Map variety, M2: the client draws the board the state carries

**Milestone:** m2-integration
**Parent feature:** [map-variety.index.md](./map-variety.index.md)
**Created on:** 2026-10-04
**Status:** concluído em 2026-10-04

---

### 1. Objective

Take the size out of the scene. `BoardTiles` and `MatchScene` stop iterating `BOARD_WIDTH × BOARD_HEIGHT`
and read the board from the state instead, so the client draws any board the server sends.

### 2. Prerequisites

- M1 merged: `grid.ts` no longer exports a size, `iso.ts` takes one, `MAX_LEVEL` exists.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/scenes/BoardTiles.ts` | modify | Built from a board, not from constants; `levelOf` removed if still unused (section 4.1) |
| `frontend/src/scenes/MatchScene.ts` | modify | Tiles are created with the first state; picking passes the board (section 4.2) |

### 4. Contracts

#### 4.1 BoardTiles

- The constructor takes the board (`{ width, height, levels }`, the shape the protocol already carries) and a
  `levelAt` callback; it builds `width * height` `Graphics`, one per cell, each at `depthOfCell(cell)`.
- `sync(levelAt)` and `levelOf(cell)` index with **this board's** width. `levelOf` is dead code today
  (`MatchScene` reads levels from the state directly), so it goes; if a later milestone needs it, it comes
  back with a caller.
- Drawing is unchanged: `FACE_COLORS[level]` for the two side faces, `heightColor(level)` for the top, 1 px
  `GRID_STROKE_COLOR` outlines, and `level > 0` deciding whether there is a block under the top face. A
  level-3 cell is drawn by exactly the same code as a level-1 cell, only taller — the palette is what makes
  it read as a wall.

#### 4.2 MatchScene

- `create()` no longer builds the tiles: the board size is unknown until the first state arrives. `this.tiles`
  starts `null`.
- `handleState` builds them once, from `message.state.board`, right after `this.state` is set and before the
  first `redraw`. A later state with a different size rebuilds them (a room always sends the same board, so
  this only guards a re-join; it costs one comparison).
- The picking at `handleClick` passes the board: `cellAt(point, this.state.board, (cell) => this.levelAt(cell))`.
  `handleClick` already returns early while `this.state` is null, so the board is always there.
- `redraw` skips the tile sync while `this.tiles` is null; nothing else in the scene changes shape.
- The highlights (`drawHighlights`, one `Graphics` per highlighted cell at `depthOfCell + HIGHLIGHT_DEPTH_STEP`),
  the sprite placement (`cellToScreen`), the unit depth and the HUD rectangles need no change: none of them
  knows the board size.

### 5. Tests planned

No new unit tests: `BoardTiles` and `MatchScene` are Phaser objects and the existing frontend suite does not
instantiate them. The size arithmetic they now depend on is covered by M1's tests, and this milestone is
verified live, in the browser, with the M3 harness (section 7).

- [x] The frontend suite stays green and `npx tsc --noEmit` is clean, which is what catches a leftover
      `BOARD_WIDTH` import. 211/211, `tsc --noEmit` and `vite build` clean.

### 6. Dependencies

- M1 merged.
- M3 depends on this: the server only starts sending 10×10 once the client can draw it.

### 7. Execution steps

1. `BoardTiles`: constructor takes the board; drop `levelOf`; index with the board's width.
2. `MatchScene`: `tiles: BoardTiles | null`; build in `handleState`; pass the board to `cellAt`; guard the sync.
3. `grep -rn "BOARD_WIDTH\|BOARD_HEIGHT" frontend/src` returns nothing.
4. `npm test -w @eldritch-alley/frontend`, `npx tsc --noEmit`, `npm run build -w @eldritch-alley/frontend`.
5. Live check with the current 8×8 server: the board is drawn smaller, the clicks still land on the cell
   under the pointer, the highlights sit on their cells, and a unit moves and attacks as before.

### 8. Acceptance

- [x] Automated checks pass.
- [x] The live check passes: no behaviour change. It ran on the **10×10** board rather than the 8×8 one this
      plan expected, because M3 landed in the same working tree before the check. The owner's smoke test is
      the record: the map shows 10×10, the picking and the highlights land on the right cells, and nothing
      else changed.
- [x] `grep` finds no board size in the client outside a test (`BOARD_WIDTH`/`BOARD_HEIGHT` are gone; `grid.ts`
      keeps only `MAX_LEVEL`).

### 9. Out of scope

- The three maps and the random pick (M3).
- Retuning `BODY_SCALE`, `TOP_Y` or the tile tones for the new scale (M4, from the screenshots).
- DT-44, the effects drawn beneath the board.

---

### 10. Divergences in the execution (2026-10-04)

- **`grid.ts` lost `BOARD_WIDTH`/`BOARD_HEIGHT` here**, as M1's divergences said it would once `BoardTiles`
  took the board.
- **The live check moved from 8×8 to 10×10** (section 8). M1's plan promised the constants would go in M2;
  M3 was already in the working tree, so the client never ran against the old 8×8 board on its own.
- `MatchScene` gained `ensureTiles(board)`, which rebuilds the tiles when a state carries a board of another
  size — section 4.2 asked for the comparison, and it is where the comparison lives.
