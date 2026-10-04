# Plan — Isometric board, M1: logic (projection, picking, depth, shading, overlay layout)

**Milestone:** m1-logic
**Parent feature:** [iso-board.index.md](./iso-board.index.md)
**Created on:** 2026-10-04
**Status:** concluído, aguardando revisão

---

### 1. Objective

Put the isometric geometry into a Phaser-free module, `view/iso.ts`: where a cell is drawn, which cell
a pixel belongs to, what order things are drawn in, and how a face is shaded. Also rewrite
`view/layout.ts` for the overlay: rectangles that may sit on top of the board, with click areas that
the scene can test. Nothing is drawn in this milestone.

### 2. Prerequisites

- None beyond the branch itself. This milestone ships in `feat/visual-identity`, after the identity
  milestones it builds on are in place in that branch.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/iso.ts` | create | Projection, picking, depth, shading (section 4) |
| `frontend/src/view/iso.test.ts` | create | Round trips, picking rules, depth, shading |
| `frontend/src/view/grid.ts` | modify | Removes `cellToPixel`, `pixelToCell`, `ORIGIN`, `TILE_SIZE`. Keeps `BOARD_WIDTH`, `BOARD_HEIGHT`, `Cell`, `Pixel`, `heightColor` |
| `frontend/src/view/grid.test.ts` | modify | Drops the tests of the removed functions. Keeps `heightColor` |
| `frontend/src/view/layout.ts` | modify | Overlay rectangles (section 4.4), `boardBounds()`, `hudRects()`. Removes `BOARD_RECT`, `SIDEBAR` and the side-by-side arithmetic |
| `frontend/src/view/layout.test.ts` | modify | New rules: rectangles inside the canvas, HUD panels do not overlap each other, the board's bounds do not reach the carousel or the action bar |

Not touched: `scenes/`, `game/`, `backend/`, `protocol.ts`.

### 4. Contracts and exact values

#### 4.1 Projection (`iso.ts`)

```ts
export const TILE_W = 80;
export const TILE_H = 40;
export const HZ = 20;
export const CX = 640;
export const TOP_Y = 200;

/** Centre of the top face of a cell at a level, in canvas pixels. */
export function cellToScreen(cell: Cell, level: number): Pixel;
/** The four corners of a top face, N, E, S, W, clockwise from the top. */
export function topFace(cell: Cell, level: number): [Pixel, Pixel, Pixel, Pixel];
```

Formulas (fixed, not to be changed by the executor):

- `cx = CX + (cell.x - cell.y) * TILE_W / 2`
- `cy = TOP_Y + (cell.x + cell.y + 1) * TILE_H / 2 - level * HZ`
- Top face corners: `N = (cx, cy - TILE_H/2)`, `E = (cx + TILE_W/2, cy)`, `S = (cx, cy + TILE_H/2)`, `W = (cx - TILE_W/2, cy)`.

Checked values that the tests must reproduce exactly:

| Cell | Level | Centre |
|---|---|---|
| (0, 0) | 0 | (640, 220) |
| (7, 0) | 0 | (920, 360) |
| (0, 7) | 0 | (360, 360) |
| (7, 7) | 0 | (640, 500) |
| (3, 3) | 2 | (640, 340) |

#### 4.2 Picking

```ts
/** The cell under a point, or null. `levelAt` gives each cell's level. */
export function cellAt(point: Pixel, levelAt: (cell: Cell) => number): Cell | null;
```

Rule, in this order:

1. Candidate cells are visited from the front (largest `x + y`) to the back.
2. A cell **contains** the point when the point lies inside its top face (a diamond with the corners of
   `topFace`).
3. If no top face contains the point, the front-most cell whose **block silhouette** contains it is
   returned. The silhouette is the top face extruded straight down by `level * HZ` plus the base half
   diamond `TILE_H / 2`. This makes a click on a block's side face pick that block.
4. Otherwise `null`.

Point-in-diamond test: `|px - cx| / (TILE_W/2) + |py - cy| / (TILE_H/2) <= 1`. Integer and float inputs
both accepted; no rounding.

#### 4.3 Depth and shading

```ts
export function depthOfCell(cell: Cell): number;   // cell.x + cell.y
export function depthOfUnit(cell: Cell): number;   // cell.x + cell.y + 0.5
export function shade(color: number, factor: number): number; // factor 0..1, each channel multiplied
export const SHADE_LEFT = 0.72;
export const SHADE_RIGHT = 0.5;
```

- `shade` multiplies each 8-bit channel by `factor` and rounds down.
- The left face of a block uses `shade(top, SHADE_LEFT)`, the right face `shade(top, SHADE_RIGHT)`. These
  factors are a chosen approximation. A single factor does **not** reproduce the prototype's faces: its
  `#171b28` against `#23283a` needs about 0.66 on red and 0.69 on blue. M3 decides whether the faces
  use explicit prototype colours instead of `shade`.

#### 4.4 Overlay layout (`layout.ts`)

All rectangles are in canvas pixels, canvas `1280 × 720`.

| Name | x | y | width | height | Holds |
|---|---|---|---|---|---|
| `CAROUSEL_RECT` | 248 | 16 | 784 | 80 | Turn order, top centre |
| `ACTION_BAR_RECT` | 248 | 648 | 784 | 56 | Four buttons, bottom centre |
| `PANEL_RECT` | 16 | 120 | 300 | 300 | Unit panel, left |
| `LOG_RECT` | 964 | 120 | 300 | 300 | Log, right |
| `LEGEND_RECT` | 16 | 440 | 300 | 44 | Legend, bottom-left |
| `STATUS_RECT` | 16 | 492 | 300 | 24 | Status line, bottom-left |

- `boardBounds()`: the rectangle that contains every top face and block of the board at the highest
  level: x `CX - 7 * TILE_W/2 - TILE_W/2` to `CX + 7 * TILE_W/2 + TILE_W/2` (that is 320 to 960), y
  `TOP_Y` to `TOP_Y + 14 * TILE_H/2 + TILE_H + 2 * HZ` (that is 200 to 560).
- `hudRects()`: the six rectangles above, in order.
- `containsPoint(rect, point)` and `buttonIndexAt(point)` stay as they are (half-open rectangles).
- `buttonRect(index)` moves with `ACTION_BAR_RECT`; the four buttons keep 184 × 56 and 16 px gaps.
- `carouselSlotRect(index)` keeps 96 × 64 slots with 8 px gaps, starting inside the carousel.

### 5. Tests planned

**`iso.test.ts`**
- [ ] `cellToScreen` reproduces the five checked values of 4.1.
- [ ] Each level lifts the centre by exactly `HZ` (20 px).
- [ ] Round trip: for all 64 cells and levels 0, 1, 2, the centre point maps back to the same cell.
- [ ] A point just inside each corner of a top face (4 px inside) maps to that cell.
- [ ] A point far outside the board (`x = -500`, and `y = 900`) returns `null`.
- [ ] A tall block at level 2 that hides the flat cell behind it: the point at the top of the block picks
      the block, not the cell behind.
- [ ] A point on the right side face of a level-2 block picks that block (rule 3).
- [ ] `depthOfCell({x:1,y:2}) === 3`; `depthOfUnit({x:1,y:2}) === 3.5`; a unit on a cell is drawn after
      that cell and before the next cell in depth.
- [ ] `shade(0x23283a, 0.5)` equals `0x11141d` channel by channel (each channel of `0x23283a` halved, rounded down).
- [ ] `shade` with factor `1` returns the input; factor `0` returns `0x000000`; a factor outside `0..1`
      throws `RangeError`.

**`layout.test.ts`** (replaces the side-by-side tests)
- [ ] Every HUD rectangle lies inside `1280 × 720`.
- [ ] No two HUD rectangles overlap, except where a panel is meant to sit over the board (none do).
- [ ] `boardBounds()` does not intersect `CAROUSEL_RECT` or `ACTION_BAR_RECT`.
- [ ] `boardBounds()` is `{x: 320, y: 200, width: 640, height: 360}`.
- [ ] The four buttons keep their centres inside `ACTION_BAR_RECT`, and `buttonIndexAt` finds each.

**`grid.test.ts`**
- [ ] `heightColor` tests kept. The removed-function tests are deleted, not skipped.

### 6. Dependencies

- Visual identity milestones in the same branch.
- Downstream: M2 imports everything from `iso.ts` and `layout.ts`.

### 7. Execution steps

1. Write `iso.test.ts` and `layout.test.ts` first; run them and watch them fail.
2. Write `iso.ts`. Then rewrite `layout.ts`.
3. Remove the flat helpers from `grid.ts` and update `grid.test.ts`. Do **not** fix the scenes yet: the
   build is expected to fail on `MatchScene.ts` and `units.ts` until M2. Record that in the PR.
4. Run `npm test -w @eldritch-alley/frontend`. Only the `frontend/src/scenes` build errors are allowed to
   remain; `npx vitest run` must be green.

### 8. Acceptance

- [ ] All `view/` and `game/` tests pass.
- [ ] `npx tsc --noEmit` reports errors only in `frontend/src/scenes/` (expected, fixed in M2).
- [ ] No file under `backend/` changed.
- [ ] The five checked values and the round trip are in the test file, not only in this plan.

### 9. Out of scope

Drawing (M2 and M3). Fading occluding tiles. Any change to the engine or the protocol. The title screen's
projection (it may import these constants later, in its own plan).
