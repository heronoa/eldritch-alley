// The relief of one map, as the client reads it, and the handful of drawings `data.js` keeps beside the
// game data.
//
// Map fidelity M1 put the three maps in the client as data: tiles, heights, the void marker and the
// lift. This module is the one place that turns that data into the answers the projection, the picking
// and the drawing ask for, so nothing else has to know that a gap is marked by a sentinel height or
// that `lift` is counted in the prototype's own pixels.
//
// Two things live here that the server has no use for. The first is `lift`: the server needs the
// height of a cell, which is the number in the data, and only the drawing needs to know how far the
// prototype lowers the whole rooftop. The second is `decor` — the painted road markings, the fire
// escapes, the wires and the clothesline. They are visible parts of the prototype's maps, but they are
// presentation, so they stay on this side of the wire instead of being copied into the shared data
// file, where the server would carry fields it never reads.
//
// Since the camera feature (EA-12) this is also where a map is turned to face the camera. The map data
// itself never changes: `terrainOf` takes the view as a parameter and hands back the same map read
// through the rotation, so every drawing and every neighbour lookup downstream works in view
// coordinates without knowing that a view exists. What the rotation cannot carry — a detail that is
// only correct from one side — is turned explicitly below, and everything else is recomputed from the
// neighbours of the turned tiles by the modules that draw them.
import { NO_FLOOR, type BoardSize, type Cell } from '../view/grid';
import { rotateCell, rotatedSize, unrotateCell, viewTurns } from '../view/rotation';
import { PROTOTYPE_MAPS, type PropSpec, type PrototypeMap, type PrototypeMapId } from './prototype-maps';

/** A line strung from one cell to another, as `data.js` writes it. */
export interface Span {
  readonly from: Cell;
  readonly to: Cell;
}

/**
 * A painted road marking. It is an edge, not a cell: the street's middle runs *between* two rows of
 * asphalt, so a marking that was stored as a row of the map could not survive the map being turned.
 */
export interface Lane {
  /** The two cells the marking runs between. They are neighbours, and the edge they share is the line. */
  readonly from: Cell;
  readonly to: Cell;
  /** Whether it is the dashes down the middle of the road, or a line along the road's own side. */
  readonly centre: boolean;
}

/** What only the drawing reads of a map, in the coordinates of the view it is drawn in. */
export interface MapDecor extends Omit<DecorSource, 'centreLine'> {
  readonly lanes: readonly Lane[];
}

/** One map's drawings as `data.js` writes them, before the map is turned to face the camera. */
export interface DecorSource {
  /** The row the street's centre line runs along, or null when the map paints no road markings. */
  readonly centreLine: number | null;
  /** Whether the ground floor of the buildings carries shops. */
  readonly shops: boolean;
  /** Whether the parking lot runs a fence around its tiles. */
  readonly fence: boolean;
  /** The facades that carry a fire escape. */
  readonly fireEscapes: readonly Cell[];
  /** The wires strung over the street. */
  readonly wires: readonly Span[];
  /** The clotheslines strung between two rooftops. */
  readonly lines: readonly Span[];
}

/** A prop as the drawing reads it: the map's own spec, plus the view it is seen from. */
export interface DrawnProp extends PropSpec {
  /**
   * The view the prop is drawn in, as `viewTurns` counts it: 0 is the map's own. A prop whose drawing
   * depends on the side it is seen from — a car lying along its street — is drawn from this.
   */
  readonly view?: number;
}

/** One map as the client draws and picks on it. Every coordinate here is one of the view's own. */
export interface Terrain {
  readonly id: PrototypeMapId;
  /** The map's own data, turned to face the camera: its tiles, its heights and its demo spawns. */
  readonly map: PrototypeMap;
  /** The map's props, turned with it. */
  readonly props: readonly DrawnProp[];
  /** The size of the view: the map's own, with its two sides swapped on a view turned a quarter. */
  readonly size: BoardSize;
  /** The size of the map itself, which is the grid a cell of the map is stated in. */
  readonly mapSize: BoardSize;
  /** How far the prototype lowers the whole map, in its own pixels. Only the rooftop has one. */
  readonly lift: number;
  /** Whether a cell is a gap with no floor under it. */
  readonly isVoid: (cell: Cell) => boolean;
  /** The height of a cell, or `NO_FLOOR` when it has none. Off the board there is no floor either. */
  readonly levelAt: (cell: Cell) => number;
  readonly decor: MapDecor;
}

/** The drawings of `data.js` that are not props, map by map. */
const DECOR: Record<PrototypeMapId, DecorSource> = {
  street: {
    centreLine: 2,
    shops: true,
    fence: true,
    fireEscapes: [
      { x: 3, y: 5 },
      { x: 3, y: 8 },
      { x: 2, y: 0 },
      { x: 7, y: 0 },
    ],
    wires: [
      { from: { x: 2, y: 1 }, to: { x: 7, y: 1 } },
      { from: { x: 2, y: 4 }, to: { x: 2, y: 1 } },
      { from: { x: 7, y: 4 }, to: { x: 7, y: 1 } },
    ],
    lines: [],
  },
  park: { centreLine: null, shops: false, fence: false, fireEscapes: [], wires: [], lines: [] },
  roof: {
    centreLine: null,
    shops: false,
    fence: false,
    fireEscapes: [],
    wires: [],
    lines: [{ from: { x: 4, y: 3 }, to: { x: 5, y: 6 } }],
  },
};

/** The map a match is played on, by the id the state carries, read from the view `steps` turns round. */
export function terrainOf(id: PrototypeMapId, steps = 0): Terrain {
  const source = PROTOTYPE_MAPS.find((candidate) => candidate.id === id);
  if (source === undefined) throw new Error(`unknown map: ${id}`);

  const base = { width: source.tiles[0]?.length ?? 0, height: source.tiles.length };
  const map = turnedMap(source, base, steps);
  const heightOf = (cell: Cell): number | undefined => map.heights[cell.y]?.[cell.x];
  const isVoid = (cell: Cell) => heightOf(cell) === map.void;
  const decor = DECOR[id];

  return {
    id: map.id,
    map,
    props: turnedProps(source, base, steps),
    size: rotatedSize(base, steps),
    mapSize: base,
    lift: map.lift,
    isVoid,
    levelAt: (cell) => {
      const height = heightOf(cell);
      return height === undefined || height === map.void ? NO_FLOOR : height;
    },
    decor: {
      shops: decor.shops,
      fence: decor.fence,
      fireEscapes: decor.fireEscapes.map((cell) => turn(cell, base, steps)),
      wires: decor.wires.map((span) => turnedSpan(span, base, steps)),
      lines: decor.lines.map((span) => turnedSpan(span, base, steps)),
      lanes: laneMarkings(source, decor.centreLine).map((lane) => ({
        from: turn(lane.from, base, steps),
        to: turn(lane.to, base, steps),
        centre: lane.centre,
      })),
    },
  };
}

/** The props of one cell of a map, in the order `data.js` lists them. */
export function propsAt(terrain: Terrain, cell: Cell): DrawnProp[] {
  return terrain.props.filter((prop) => prop.x === cell.x && prop.y === cell.y);
}

/** A cell of the map as the view sees it. */
function turn(cell: Cell, base: BoardSize, steps: number): Cell {
  return rotateCell(cell, steps, base);
}

/** A span of the map as the view sees it: both of its ends turned. */
function turnedSpan(span: Span, base: BoardSize, steps: number): Span {
  return { from: turn(span.from, base, steps), to: turn(span.to, base, steps) };
}

/** The map's props as the view sees them, each carrying the view it is drawn in. */
function turnedProps(source: PrototypeMap, base: BoardSize, steps: number): readonly DrawnProp[] {
  return source.props.map((prop) => ({
    ...prop,
    ...turn(prop, base, steps),
    view: viewTurns(steps),
  }));
}

/**
 * The map's tiles and heights, read through the rotation: one row and column per cell of the view, each
 * filled from the cell of the map it was turned from. The turn is a permutation of the board, so every
 * neighbour a drawing asks about afterwards is a neighbour of the turned board, which is what lets the
 * kerbs, the parapets and the fences be drawn from the map alone.
 */
function turnedMap(source: PrototypeMap, base: BoardSize, steps: number): PrototypeMap {
  const size = rotatedSize(base, steps);
  const tiles: string[] = [];
  const heights: number[][] = [];

  for (let y = 0; y < size.height; y += 1) {
    let row = '';
    const levels: number[] = [];
    for (let x = 0; x < size.width; x += 1) {
      const from = unrotateCell({ x, y }, steps, size);
      row += source.tiles[from.y][from.x];
      levels.push(source.heights[from.y][from.x]);
    }
    tiles.push(row);
    heights.push(levels);
  }

  return {
    ...source,
    tiles,
    heights,
    spawns: {
      A: source.spawns.A.map((cell) => turn(cell, base, steps)),
      B: source.spawns.B.map((cell) => turn(cell, base, steps)),
    },
  };
}

/**
 * Where the street paints its road markings, read off the map itself: the dashes run down the middle
 * of the road, along the edge between the two rows of asphalt that straddle the centre line, and a
 * line runs along each side of the road where the asphalt meets the pavement.
 *
 * The markings are built here, on the map as `data.js` writes it, and the view turns them afterwards.
 * The street is the only map whose road runs along x, and a rule written for that road cannot be
 * applied to a board that has been turned a quarter: the row that holds the centre line becomes a
 * column, and no row of the turned map holds it. A neighbour rule written here, where the road still
 * runs the way the map draws it, is the same rule in every view.
 */
function laneMarkings(map: PrototypeMap, centreLine: number | null): readonly Lane[] {
  const tile = (x: number, y: number): string | undefined => map.tiles[y]?.[x];
  const lanes: Lane[] = [];

  for (let y = 0; y < map.tiles.length; y += 1) {
    for (let x = 0; x < map.tiles[y].length; x += 1) {
      if (tile(x, y) !== 'a') continue;
      if (tile(x, y - 1) === 's') lanes.push({ from: { x, y }, to: { x, y: y - 1 }, centre: false });
      if (tile(x, y + 1) === 's') lanes.push({ from: { x, y }, to: { x, y: y + 1 }, centre: false });
    }
  }

  if (centreLine === null) return lanes;

  // The dashes run along the edge the two rows of asphalt share, one every other cell, and only where
  // the crosswalk does not cross them.
  for (let x = 0; x < (map.tiles[centreLine]?.length ?? 0); x += 1) {
    if (x % 2 !== 0) continue;
    if (tile(x, centreLine) !== 'a' || tile(x, centreLine + 1) !== 'a') continue;

    lanes.push({ from: { x, y: centreLine }, to: { x, y: centreLine + 1 }, centre: true });
  }

  return lanes;
}
