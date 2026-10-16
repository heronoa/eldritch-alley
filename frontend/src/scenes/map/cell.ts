// One cell of a map, drawn on its own canvas: the block's two side faces, the facade under a rooftop,
// its top face with the texture of its tile, its kerbs, its parapet and its fence. A port of the
// per-cell part of `render` in the prototype's `js/app.js`, in the prototype's own pixels.
//
// This module also owns the primitives the whole drawing is made of — `px`, `poly`, `line` and `isoBox` —
// because the cells are where they come from and the prop drawers are drawn with the same ones.
//
// Two things of the prototype's cell loop are deliberately not here. The gap (`v`) is not drawn at all:
// decision 7 of the feature gives a gap no floor, where the prototype paints a diamond seven steps below
// the deck with a car's light crossing it. And the demo overlays — the threat marking, the move and
// attack washes, the selected cell, the hover outline — belong to the game's own highlights, which
// `MatchScene` draws from the state.
import type { Cell, Pixel } from '../../view/grid';
import { HZ as CANVAS_HZ, PIXEL, TILE_H, TILE_W } from '../../view/iso';
import { TILE_PALETTE, shadeHex } from '../../maps/prototype-palette';
import type { Lane, Terrain } from '../../maps/terrain';
import { cutawayLevel } from '../../view/cutaway';
import { rnd } from './random';

/** The prototype's tile, in its own pixels. Everything below is written in these and scaled by `PIXEL`. */
export const TW = TILE_W / PIXEL;
export const TH = TILE_H / PIXEL;
export const HZ = CANVAS_HZ / PIXEL;

/** How far the prototype drops a rooftop's facades below their top faces, on that map alone. */
const ROOF_FACADE = 56;

/**
 * How far a cell's drawing reaches past its own diamond, in the prototype's pixels. The three maps
 * stay inside: the widest thing any of them draws is the tree, 15 to the side. A prop that reached
 * further would be cut off at the edge of the cell's canvas, silently.
 */
const REACH_UP = 40;
const REACH_DOWN = 16;
const REACH_SIDE = 16;

/** A point of the prototype's own drawing, as a pair. */
export type Point = readonly [number, number];

/** The 2d context of a canvas that was just made, or a failure worth reading. */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('no 2d context for the map canvas');

  return ctx;
}

/** Fills the rectangle at a rounded corner, as the prototype's `px` does. */
export function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), width, height);
}

/** Fills the closed polygon through `points`. */
export function poly(ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string): void {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Strokes the segment from `from` to `to`. */
export function line(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

/**
 * Strokes the open path through `points`, as one path. A chain of segments the prototype draws with
 * one `moveTo` and a run of `lineTo` is one path there and has to be one here: a corner joined by two
 * separate strokes is a pixel wider than a corner joined by one.
 */
export function stroke(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  color: string,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

/**
 * The prototype's `isoBox`: a box of half extents `a`, `b` and height `h` standing on `(cx, cy)` — its
 * left face, its right face, then its top. Every prop that is a box is one of these.
 */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  a: number,
  b: number,
  h: number,
  top: string,
  left: string,
  right: string,
): void {
  const at = (u: number, v: number, z: number): Point => [
    cx + ((u - v) * TW) / 2,
    cy + ((u + v) * TH) / 2 - z,
  ];

  poly(ctx, [at(-a, b, 0), at(a, b, 0), at(a, b, h), at(-a, b, h)], left);
  poly(ctx, [at(a, -b, 0), at(a, b, 0), at(a, b, h), at(a, -b, h)], right);
  poly(ctx, [at(-a, -b, h), at(a, -b, h), at(a, b, h), at(-a, b, h)], top);
}

/** The letter of the tile a cell is drawn as. */
export function letterOf(terrain: Terrain, cell: Cell): string {
  return terrain.map.tiles[cell.y][cell.x];
}

/**
 * The letter at `x, y`, for a neighbourhood lookup that may step off the board. What lies beyond the
 * edge is the caller's to say: a facade treats it as the gap, a kerb as a building.
 */
function tileAt(terrain: Terrain, x: number, y: number, outside: string): string {
  const { size, map } = terrain;
  if (x < 0 || y < 0 || x >= size.width || y >= size.height) return outside;

  return map.tiles[y][x];
}

/**
 * The level a cell is drawn at in the current view. A building tall enough to hide playable ground
 * behind it is cut down, so that ground can be seen over it; everything else is drawn at its own level,
 * and a gap is still a gap.
 *
 * This is the view's drawing and not the map (EA-12, slice 4): the building is whole for the rules, and
 * blocking movement and sight exactly as it did. Only what the player is shown changes.
 */
export function drawnLevel(terrain: Terrain, cell: Cell): number {
  const level = terrain.levelAt(cell);

  return cutawayLevel(cell, level, terrain.size, (other) => letterOf(terrain, other) === 'B');
}

/** Whether the view has cut a cell down: a building drawn lower than it stands. */
function isCut(terrain: Terrain, cell: Cell): boolean {
  return drawnLevel(terrain, cell) < terrain.levelAt(cell);
}

/** How far a cell's faces drop below its top face, in the prototype's pixels. */
export function depthOf(terrain: Terrain, cell: Cell): number {
  const letter = letterOf(terrain, cell);
  const level = drawnLevel(terrain, cell);

  if (letter === 'B') return (level + 1) * HZ;
  return letter === 'b' ? 3 : (level + 1) * HZ + (terrain.map.sky === 'roof' ? ROOF_FACADE : 0);
}

/** The box one cell's canvas needs, and where the centre of its top face sits inside it. */
export function cellBox(depth: number): { width: number; height: number; anchor: Pixel } {
  return {
    width: TW + 2 * REACH_SIDE,
    height: TH / 2 + REACH_UP + TH / 2 + depth + REACH_DOWN,
    anchor: { x: TW / 2 + REACH_SIDE, y: TH / 2 + REACH_UP },
  };
}

/** One cell being drawn: the context, the map, which cell, and where in the canvas its top face is. */
export interface CellDrawing {
  readonly ctx: CanvasRenderingContext2D;
  readonly terrain: Terrain;
  readonly cell: Cell;
  /** The centre of the cell's top face, in the cell canvas's own pixels. */
  readonly at: Pixel;
  /** The moment of the animation, in seconds: what the water's shimmer is read against. */
  readonly time: number;
}

/** The four corners of a cell's top face, as the prototype's drawing names them. */
interface Corners {
  readonly n: Point;
  readonly e: Point;
  readonly s: Point;
  readonly w: Point;
}

/** The corners of a top face whose centre is `at`, in the prototype's own pixels. */
function cornersOf(at: Pixel): Corners {
  const sx = at.x;
  const sy = at.y - TH / 2;

  return {
    n: [sx, sy],
    e: [sx + TW / 2, sy + TH / 2],
    s: [sx, sy + TH],
    w: [sx - TW / 2, sy + TH / 2],
  };
}

/** Whether the cell's own drawing moves from frame to frame. Only the park's water does. */
export function movesOverTime(terrain: Terrain, cell: Cell): boolean {
  return letterOf(terrain, cell) === 'w';
}

/** The moving part of a cell of its own: the park's water. Everything else a cell draws stands still. */
export function drawCellAnimation({ ctx, terrain, cell, at, time }: CellDrawing): void {
  if (!movesOverTime(terrain, cell)) return;

  ctx.globalAlpha = 0.4 + Math.sin(time * 1.5 + cell.x + cell.y) * 0.2;
  px(ctx, at.x - 4 + Math.sin(time + cell.y) * 2, at.y - TH / 2 + 7, 5, 1, '#5d7fc4');
  ctx.globalAlpha = 1;
}

/** Draws the whole of one cell: its block, its top face and the decoration of its tile. */
export function drawCell(drawing: CellDrawing): void {
  const { ctx, terrain, cell } = drawing;
  const corners = cornersOf(drawing.at);
  const { n, e, s, w } = corners;
  const letter = letterOf(terrain, cell);

  if (letter === 'B') {
    drawBuilding(drawing, corners);
    return;
  }

  const tile = TILE_PALETTE[letter];
  const depth = depthOf(terrain, cell);
  const roof = terrain.map.sky === 'roof';

  poly(ctx, [w, s, [s[0], s[1] + depth], [w[0], w[1] + depth]], tile.left);
  poly(ctx, [s, e, [e[0], e[1] + depth], [s[0], s[1] + depth]], tile.right);
  if (roof) drawRoofFacade(drawing, corners, depth);
  poly(ctx, [n, e, s, w], tile.top);

  drawTexture(drawing, corners);

  if (letter === 's') drawKerbs(ctx, terrain, cell, corners);
  if (roof && (letter === 'r' || letter === 'k')) drawParapet(ctx, terrain, cell, corners);
  if (terrain.decor.fence && letter === 'f') drawFence(ctx, terrain, cell, corners);
}

/**
 * The two side faces of a building, its windows and its roof rim: `building` of the prototype, which
 * draws a sealed block rather than a tile with a raised face.
 */
function drawBuilding(drawing: CellDrawing, corners: Corners): void {
  const { ctx, terrain, cell } = drawing;
  const { n, e, s, w } = corners;
  const tile = TILE_PALETTE.B;
  const depth = depthOf(terrain, cell);

  poly(ctx, [w, s, [s[0], s[1] + depth], [w[0], w[1] + depth]], tile.left);
  poly(ctx, [s, e, [e[0], e[1] + depth], [s[0], s[1] + depth]], tile.right);
  poly(ctx, [n, e, s, w], tile.top);

  // Seeded by the cell, so a building is the same building on every frame and in every run.
  const random = rnd(cell.x * 31 + cell.y * 17 + 3);
  const cut = isCut(terrain, cell);
  for (let row = 4; row < depth - 4; row += 6) {
    for (let k = 2; k < TW / 2 - 2; k += 4) {
      const left = random() < 0.28 ? 'rgba(240,217,160,.55)' : '#0b0e17';
      px(ctx, w[0] + k, w[1] + k / 2 + row, 2, 3, left);
      const right = random() < 0.22 ? 'rgba(240,217,160,.45)' : '#0b0e17';
      px(ctx, s[0] + k, s[1] - k / 2 + row, 2, 3, right);
    }
  }

  // The rim of the roof: a hair of paper along its two far edges, half a pixel up so it lands on the
  // seam between two rows of pixels instead of being split across both.
  stroke(
    ctx,
    [
      [w[0], w[1] + 0.5],
      [n[0], n[1] + 0.5],
      [e[0], e[1] + 0.5],
    ],
    'rgba(230,220,196,.08)',
  );

  // A building the view has cut down is striped across its top, so a roof the player can see over is
  // never taken for a building that is only two levels tall.
  if (cut) {
    for (let k = -12; k <= 12; k += 4) {
      line(ctx, [n[0] + k - 4, n[1] + 6 + k / 2], [n[0] + k + 4, n[1] + 10 + k / 2], 'rgba(230,220,196,.18)');
    }
  }

  if (terrain.decor.shops) drawShops(drawing, corners, depth, random);
  drawFireEscape(ctx, terrain, cell, corners, depth);
}

/**
 * The ground floor of a building, which only the street map has: the roll-up doors of its first row and
 * first column, then the shops of any facade that looks onto open ground. The prototype guards the two
 * with different flags — its map key and its `shops` one — and only the street sets either, so one flag
 * covers both here.
 */
function drawShops(drawing: CellDrawing, corners: Corners, depth: number, random: () => number): void {
  const { ctx, terrain, cell } = drawing;
  const { s, w } = corners;
  const { size, map } = terrain;

  const rollUp = (base: Point, dir: number) => {
    const rolls = rnd(cell.x * 5 + cell.y * 3 + (dir > 0 ? 1 : 2));
    const bottom = depth - 2;
    const top = depth - 13;

    for (let k = 1; k < TW / 2 - 1; k += 1) {
      for (let row = top + 3; row < bottom; row += 2) {
        px(ctx, base[0] + k, base[1] + (dir * k) / 2 + row, 1, 1, '#2a2e3f');
      }
    }

    const awning = ['#6a2a2a', '#2f4e79', '#4a4a3a'][Math.floor(rolls() * 3)];
    for (let k = 0; k < TW / 2; k += 1) {
      const y = base[1] + (dir * k) / 2;
      px(ctx, base[0] + k, y + top, 1, 3, k % 4 < 2 ? awning : shadeHex(awning, -0.3));
    }
    if (rolls() < 0.35) {
      for (let k = 4; k < 10; k += 1) {
        px(ctx, base[0] + k, base[1] + (dir * k) / 2 + top + 4, 1, 4, 'rgba(240,217,160,.35)');
      }
    }
  };

  if (cell.y === 0) rollUp(w, 1);
  if (cell.x === 0) rollUp(s, -1);

  // A facade with a building behind it has no shop, and the last row and column have no facade to speak
  // of — the prototype asks about the cell past the edge before it reads the tile there.
  const awning = ['#5a2a2a', '#2a4a3a', '#2d3a55', '#4a3e22'][(cell.x + cell.y) % 4];

  const shop = (ax: number, ay: number, dir: number) => {
    const open = random() < 0.45;

    for (let k = 2; k < TW / 2 - 2; k += 1) {
      const y = ay + (dir * k) / 2;
      px(ctx, ax + k, y + depth - 13, 1, 9, open ? 'rgba(240,217,160,.42)' : '#2a2e3d');
      if (!open && k % 2 === 0) px(ctx, ax + k, y + depth - 12 + (k % 4), 1, 1, '#1a1d29');
      px(ctx, ax + k, y + depth - 15, 1, 2, awning);
    }
    if (random() < 0.5) {
      const gx = ax + 4 + random() * 6;
      px(ctx, gx, ay + depth - 22, 4, 1, '#7a6f8f');
      px(ctx, gx + 1, ay + depth - 21, 3, 1, '#6a5f7e');
    }
  };

  if (cell.y + 1 < size.height && map.tiles[cell.y + 1][cell.x] !== 'B') shop(w[0], w[1], 1);
  if (cell.x + 1 < size.width && map.tiles[cell.y][cell.x + 1] !== 'B') shop(s[0], s[1], -1);
}

/** The fire escapes of `data.js`: a stair of bars across the right face, then the rail down it. */
function drawFireEscape(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  cell: Cell,
  { s, e }: Corners,
  depth: number,
): void {
  if (!terrain.decor.fireEscapes.some((escape) => escape.x === cell.x && escape.y === cell.y)) return;

  for (let row = 6; row < depth - 4; row += 9) {
    line(ctx, [s[0] + 2, s[1] - 1 + row], [e[0] - 3, e[1] + row], '#3a3f55');
  }
  line(ctx, [s[0] + 5, s[1] + 4], [s[0] + 5, s[1] + depth - 4], '#3a3f55');
}

/**
 * The facade under a rooftop: the windows of the building the deck sits on, on the sides that look onto
 * the gap or off the edge of the map, and the lit ground floor of the machine room.
 */
function drawRoofFacade(drawing: CellDrawing, { w, s }: Corners, depth: number): void {
  const { ctx, terrain, cell } = drawing;
  if (letterOf(terrain, cell) === 'b') return;

  const random = rnd(cell.x * 7 + cell.y * 13);
  const tile = (x: number, y: number) => tileAt(terrain, x, y, 'v');

  for (let row = 12; row < depth - 2; row += 7) {
    if (tile(cell.x, cell.y + 1) === 'v') {
      for (let k = 3; k < TW / 2 - 2; k += 5) {
        px(ctx, w[0] + k, w[1] + k / 2 + row, 2, 3, random() < 0.3 ? 'rgba(240,217,160,.5)' : '#0b0e17');
      }
    }
    if (tile(cell.x + 1, cell.y) === 'v') {
      for (let k = 3; k < TW / 2 - 2; k += 5) {
        px(ctx, s[0] + k, s[1] - k / 2 + row, 2, 3, random() < 0.3 ? 'rgba(240,217,160,.4)' : '#0b0e17');
      }
    }
  }

  if (letterOf(terrain, cell) !== 'h') return;

  for (let k = 5; k < 10; k += 1) {
    for (let row = depth - 13; row < depth - 1; row += 1) {
      const edge = row === depth - 13 || k === 5 || k === 9;
      px(ctx, w[0] + k, w[1] + k / 2 + row, 1, 1, edge ? '#1a1d2b' : 'rgba(240,217,160,.55)');
    }
  }
}

/**
 * The texture of a tile: the paint, the gravel, the grass or the water laid over its top face.
 *
 * The one thing a tile draws that moves — the shimmer over the park's water — is not here but in
 * `drawCellAnimation`: this pass runs once, and a mark that changes from frame to frame would be left
 * behind on the canvas it was first drawn on.
 */
function drawTexture({ ctx, terrain, cell }: CellDrawing, corners: Corners): void {
  const { n, s, w } = corners;
  const letter = letterOf(terrain, cell);
  const random = rnd(cell.x * 13 + cell.y * 7 + 1);
  // The marks of a tile's texture at random points of its top face. `reach` is how far from the north
  // corner they may fall, which the prototype sets per tile: nine for the gravel and the grass, eight
  // for the bare roofs. A tile whose marks are all one colour draws no second number, so the sequence
  // the next draw reads stays the prototype's.
  const specks = (count: number, one: string, other: string, reach = 9) => {
    for (let k = 0; k < count; k += 1) {
      const x = n[0] - reach + random() * reach * 2;
      const y = n[1] + 3 + random() * 10;
      px(ctx, x, y, 1, 1, one === other || random() < 0.5 ? one : other);
    }
  };

  if (letter === 'z') {
    // The stripes run along the street and are laid across it, so which way they point is read from the
    // neighbours rather than from the map: a view that has turned the map a quarter turns them with it.
    const along = roadRunsAlongX(terrain, cell)
      ? { x: TW / 4, y: TH / 4 }
      : { x: -TW / 4, y: TH / 4 };
    const across = { x: -along.x, y: along.y };
    // The prototype's `sx` and `sy`: the middle of the top face across, and its north corner down.
    const middle = n[1] + TH / 2;

    for (const k of [-0.55, 0, 0.55]) {
      const cx = n[0] + across.x * k;
      const cy = middle + across.y * k;
      line(
        ctx,
        [cx - along.x * 0.6, cy - along.y * 0.6],
        [cx + along.x * 0.6, cy + along.y * 0.6],
        'rgba(230,220,196,.5)',
        2,
      );
    }
    return;
  }

  if (letter === 'a') {
    for (const lane of lanesAt(terrain, cell)) drawLane(ctx, corners, lane);

    for (let k = 0; k < 2; k += 1) {
      px(ctx, n[0] - 6 + random() * 12, n[1] + 4 + random() * 8, 1, 1, '#30364a');
    }
    return;
  }

  if (letter === 'k') {
    specks(7, '#3f4252', '#1d1f29');
    return;
  }

  if (letter === 'b') {
    for (let k = -6; k <= 6; k += 4) {
      line(ctx, [n[0] + k - 4, n[1] + 6 + k / 2], [n[0] + k + 4, n[1] + 10 + k / 2], '#3e3325');
    }
    return;
  }

  if (letter === 'r') {
    line(ctx, [w[0] + 2, w[1]], [n[0], s[1] - 1], 'rgba(0,0,0,.35)');
    specks(4, '#3a3f55', '#3a3f55', 8);
    return;
  }

  if (letter === 's' || letter === 'q') {
    // The cross of the paving, as one path of two arms: drawn as two paths, the pixel where they meet
    // takes the transparent ink twice and reads darker than the four arms it joins.
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(n[0] - 8, n[1] + 4);
    ctx.lineTo(n[0] + 8, n[1] + 12);
    ctx.moveTo(n[0] + 8, n[1] + 4);
    ctx.lineTo(n[0] - 8, n[1] + 12);
    ctx.stroke();
    return;
  }

  if (letter === 'g') {
    specks(6, '#2a4236', '#16241d');
    return;
  }

  if (letter === 'R' || letter === 'p' || letter === 'x') specks(5, '#3d4152', '#1a1d27', 8);
}

/**
 * The corners a cell shares with the neighbour one step away. Two neighbours of a diamond meet along
 * the segment between the two corners they share, which is what a lane marking is painted along.
 */
const SHARED_EDGE: Readonly<Record<string, readonly [keyof Corners, keyof Corners]>> = {
  '1,0': ['e', 's'],
  '-1,0': ['w', 'n'],
  '0,1': ['s', 'w'],
  '0,-1': ['n', 'e'],
};

/** The lane markings that are drawn from a cell, which is the cell they are anchored on. */
function lanesAt(terrain: Terrain, cell: Cell): readonly Lane[] {
  return terrain.decor.lanes.filter((lane) => lane.from.x === cell.x && lane.from.y === cell.y);
}

/**
 * One lane marking, drawn along the edge two neighbouring cells share: the dashes down the middle of
 * the road keep to the middle half of it, and the line along the road's side to a wider stretch, both
 * as the prototype draws them.
 */
function drawLane(ctx: CanvasRenderingContext2D, corners: Corners, lane: Lane): void {
  const shared = SHARED_EDGE[`${lane.to.x - lane.from.x},${lane.to.y - lane.from.y}`];
  if (shared === undefined) return;

  const a = corners[shared[0]];
  const b = corners[shared[1]];
  const [first, last] = lane.centre ? [0.25, 0.75] : [0.125, 0.875];
  const at = (fraction: number): Point => [
    a[0] + (b[0] - a[0]) * fraction,
    a[1] + (b[1] - a[1]) * fraction,
  ];

  line(ctx, at(first), at(last), lane.centre ? 'rgba(217,180,74,.75)' : 'rgba(230,220,196,.35)');
}

/** Whether the street a crosswalk crosses runs along x of the view, which is which way its stripes run. */
function roadRunsAlongX(terrain: Terrain, cell: Cell): boolean {
  const road = (x: number, y: number): boolean => {
    const letter = tileAt(terrain, x, y, 'B');
    return letter === 'a' || letter === 'z';
  };

  return road(cell.x - 1, cell.y) || road(cell.x + 1, cell.y);
}

/** The kerb of a pavement: a paper line along every edge that looks onto asphalt. */
function drawKerbs(ctx: CanvasRenderingContext2D, terrain: Terrain, cell: Cell, { n, e, s, w }: Corners): void {
  // A pavement on the edge of the map has no asphalt to kerb, so the edge counts as one more building.
  const tile = (x: number, y: number) => tileAt(terrain, x, y, 'B');

  if (tile(cell.x, cell.y + 1) === 'a') line(ctx, w, s, 'rgba(230,220,196,.22)');
  if (tile(cell.x, cell.y - 1) === 'a') line(ctx, n, e, 'rgba(230,220,196,.22)');
}

/** The low wall around a rooftop, on every side that looks onto the gap, another kind of deck, or off. */
function drawParapet(ctx: CanvasRenderingContext2D, terrain: Terrain, cell: Cell, corners: Corners): void {
  const { n, e, s, w } = corners;
  const me = letterOf(terrain, cell);
  const tile = (x: number, y: number) => tileAt(terrain, x, y, 'v');
  const open = (x: number, y: number) => {
    const there = tile(x, y);
    return there === 'v' || (there !== me && there !== 'h' && there !== 'b' && there !== 'B');
  };

  const wall = (a: Point, b: Point, front: boolean) => {
    const height = 4;
    poly(ctx, [a, b, [b[0], b[1] - height], [a[0], a[1] - height]], front ? '#3a3f55' : '#262a3b');
    line(ctx, [a[0], a[1] - height], [b[0], b[1] - height], '#5a5f78');
  };

  if (open(cell.x, cell.y - 1)) wall(n, e, false);
  if (open(cell.x - 1, cell.y)) wall(w, n, false);
  if (open(cell.x + 1, cell.y)) wall(e, s, true);
  if (open(cell.x, cell.y + 1)) wall(s, w, true);
}

/** The fence around the parking lot of the street map, on the sides that look onto open ground. */
function drawFence(ctx: CanvasRenderingContext2D, terrain: Terrain, cell: Cell, { n, e, w }: Corners): void {
  const { size, map } = terrain;
  const open = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size.width && y < size.height && map.tiles[y][x] !== 'B' && map.tiles[y][x] !== 'f';

  const posts = (a: Point, b: Point) => {
    for (let k = 0; k <= 4; k += 1) {
      const x = a[0] + ((b[0] - a[0]) * k) / 4;
      const y = a[1] + ((b[1] - a[1]) * k) / 4;
      px(ctx, x, y - 5, 1, 5, 'rgba(108,113,134,.8)');
    }
    for (const off of [-5, -2]) {
      line(ctx, [a[0], a[1] + off], [b[0], b[1] + off], 'rgba(150,158,180,.35)');
    }
  };

  if (open(cell.x - 1, cell.y)) posts(w, n);
  if (open(cell.x, cell.y - 1)) posts(n, e);
}
