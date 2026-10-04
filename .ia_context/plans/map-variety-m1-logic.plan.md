# Plan — Map variety, M1: a size-driven projection and a four-tone palette

**Milestone:** m1-logic
**Parent feature:** [map-variety.index.md](./map-variety.index.md)
**Created on:** 2026-10-04
**Status:** concluído em 2026-10-04

---

### 1. Objective

Make the isometric projection and the tile palette independent of the board size, so the client can draw a
10×10 board with four height levels. No Phaser in this milestone: `view/` only, plus its tests.

### 2. Prerequisites

- None. This milestone is the first of the feature.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/grid.ts` | modify | Drops `BOARD_WIDTH`/`BOARD_HEIGHT`; adds `MAX_LEVEL = 3`; `heightColor` gains level 3 |
| `frontend/src/view/theme.ts` | modify | `FACE_COLORS` gains its fourth entry (section 4.1) |
| `frontend/src/view/iso.ts` | modify | `TILE_W`, `TILE_H`, `HZ` are rescaled; `cellsFrontToBack` and `cellAt` take a size (section 4.2) |
| `frontend/src/view/layout.ts` | modify | `boardBounds(size)` takes a size; `HIGHEST_LEVEL` is replaced by `MAX_LEVEL` |
| `frontend/src/view/grid.test.ts` | modify | Four tones; the "not on the board" case flips to 4 |
| `frontend/src/view/theme.contrast.test.ts` | modify | The level list and the pinned `FACE_COLORS` table gain level 3 |
| `frontend/src/view/iso.test.ts` | modify | Every size-dependent expectation; the sweeps run on 10×10 |
| `frontend/src/view/layout.test.ts` | modify | `boardBounds` with a size, and the board fitting the HUD-free rectangle |

### 4. Contracts

#### 4.1 The palette

| Level | Top | Left | Right | Prototype tile |
|---|---|---|---|---|
| 0 | `#23283a` | `#171b28` | `#11141f` | `a` asfalto |
| 1 | `#30364a` | `#212536` | `#1a1d2b` | `r` laje |
| 2 | `#3f4152` | `#2b2d39` | `#22242e` | `q` praça |
| 3 | `#1a1e2c` | `#141826` | `#0f121c` | `B` prédio |

- `MAX_LEVEL = 3` is the single source of "the tallest level the board can have", used by `layout.ts` for
  the box that holds every block.
- `heightColor` keeps throwing a `RangeError` for anything outside 0..3.
- The four tops stay dark enough for the paper outline of a unit's marker to clear 7:1 on all of them
  (`theme.contrast.test.ts`), and none of them equals `BG_COLOR`.

#### 4.2 Geometry

| Constant | Was | Becomes |
|---|---|---|
| `TILE_W` | 80 | 64 |
| `TILE_H` | 40 | 32 |
| `HZ` | 20 | 16 |
| `CX` | 640 | 640 (unchanged) |
| `TOP_Y` | 200 | 200 (unchanged) |

The three rescaled values keep the prototype's 2:1 diamond and the 4:2:1 ratio between tile width, tile
height and a level step, so the isometric angle and the sense of height do not change — only the scale.

A 10×10 board then measures `boardBounds({ width: 10, height: 10 })` = `{ x: 320, y: 152, width: 640,
height: 416 }`: the west corner at x 320, **4 px clear** of the left panel column, which ends at x 316
(`PANEL_RECT`, DT-50), and the east corner at x 960, 4 px clear of the right column at 964. The box now
starts at y 152, not `TOP_Y`: it has to hold a wall standing on the top corner too, so its north edge is
`TOP_Y − MAX_LEVEL * HZ`. Its south edge is y 568, so the whole board stays inside the carousel-to-action-bar
band (96..648) with room to spare.

`cellsFrontToBack(size)` becomes a function taking `{ width, height }`; the module-level
`CELLS_FRONT_TO_BACK` constant goes away. `cellAt(point, size, levelAt)` takes the same size, and the two
internal sweeps (top faces, then blocks) run over it. `topFace`, `cellToScreen`, `depthOfCell`,
`depthOfUnit`, `shade` and the `SHADE_*` factors do not change.

#### 4.3 `boardBounds`

`boardBounds(size)` takes the board it measures. Its north edge is `TOP_Y − MAX_LEVEL * HZ` (a wall on the
top corner reaches higher than the flat board's vertex — the 8×8 board never exposed this because nothing
raised sat at its north corner), and its south edge is the south corner of the last cell plus half a tile
plus `MAX_LEVEL * HZ`.

### 5. Tests planned

**`grid.test.ts`**
- [ ] `[0, 1, 2, 3].map(heightColor)` equals the four pinned tones and stays distinct.
- [ ] Each level's top equals `FACE_COLORS[level].top` (the two tables can never disagree).
- [ ] No tone equals `BG_COLOR`.
- [ ] `heightColor(4)` and `heightColor(-1)` throw `RangeError` (was 3).

**`theme.contrast.test.ts`**
- [ ] The paper marker and the corpse outline clear 7:1 on **all four** heights, level 3 included.
- [ ] The pinned `FACE_COLORS` table gains the level-3 row.
- [ ] The lightest tile a panel can cover stays level 2 (level 3 is darker), so `LIGHTEST_HEIGHT` is
      unchanged and the overlay cases keep meaning what they meant.

**`iso.test.ts`**
- [ ] `cellToScreen` pins recomputed for `TILE_W`/`TILE_H`/`HZ`: `({0,0}, 0)` = (640, 216),
      `({9,0}, 0)` = (928, 360), `({0,9}, 0)` = (352, 360), `({9,9}, 0)` = (640, 504), and the level-lift
      case keeps `HZ` between levels.
- [ ] `topFace({x:3,y:3}, 0)` = (640, 296), (672, 312), (640, 328), (608, 312).
- [ ] Every sweep (inverse of `cellToScreen`, corners, block picking) runs on a **10×10** board and passes
      the explicit size.
- [ ] The block-picking cases still hold with the new geometry (the raised block over the flat cell behind
      it, and the point on a right side face).
- [ ] Blocks are picked with a level-3 wall present, to prove a four-tone board picks as well as a three-tone
      one.

**`layout.test.ts`**
- [ ] `boardBounds({ width: 10, height: 10 })` equals `{ x: 320, y: 152, width: 640, height: 416 }`.
- [ ] The board does not overlap the carousel or the action bar, and every cell of a 10×10 board is drawn
      inside the board's own box (the projection and the box agree).
- [ ] `boardBounds` grows with the size it is given (8×8 is strictly smaller than 10×10), so the box is not
      a constant in disguise.

### 6. Dependencies

- Nothing upstream. M2 consumes `MAX_LEVEL`, the rescaled constants and the size-taking functions.

### 7. Execution steps

1. Write the failing expectations first (the four tones, the new coordinates, `boardBounds(size)`).
2. `grid.ts`: drop the two size constants, add `MAX_LEVEL`, add the level-3 tone.
3. `theme.ts`: fourth `FACE_COLORS` entry.
4. `iso.ts`: rescale, turn the cells list into a function, pass the size through `cellAt`.
5. `layout.ts`: `boardBounds(size)`, `MAX_LEVEL` imported from `grid.ts`.
6. Run `npm test -w @eldritch-alley/frontend`, `npx tsc --noEmit` and
   `npm run build -w @eldritch-alley/frontend`.

### 8. Acceptance

- [ ] The frontend suite is green with the new geometry, `tsc --noEmit` is clean and the build succeeds.
- [ ] No file outside the list above changes.
- [ ] The client still draws the server's current 8×8 board correctly (m2's subject is unchanged behaviour).

### 9. Out of scope

- Everything Phaser: `BoardTiles` and `MatchScene` keep hard-coding their own iteration until M2.
- The map data itself, which is M3's.
- `shade` and the `SHADE_*` factors, which the board no longer uses for its faces but keeps for its tests.

### 10. Divergências na execução (2026-10-04)

- **`BOARD_WIDTH`/`BOARD_HEIGHT` ficaram em `grid.ts`.** O plano pedia removê-las, mas `scenes/BoardTiles.ts`
  (arquivo do M2) ainda itera com elas. São duas constantes a menos para o M2 apagar quando `BoardTiles`
  passar a receber o tabuleiro.
- **Uma linha fora do escopo: `scenes/MatchScene.ts:247`** passou a ser
  `cellAt(point, this.state.board, …)`. A mudança de assinatura de `cellAt` quebrava a compilação, e a
  guarda da linha 236 já garante `this.state !== null`. O M2 reestrutura essa chamada de qualquer forma.
- **`cellsFrontToBack` não ficou exportada:** nada fora de `iso.ts` a usa.
- `MAX_LEVEL` foi exportado de `grid.ts` e é o que `boardBounds` usa para a borda norte da caixa.
