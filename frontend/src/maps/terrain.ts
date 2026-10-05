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
import { NO_FLOOR, type BoardSize, type Cell } from '../view/grid';
import { PROTOTYPE_MAPS, type PropSpec, type PrototypeMap, type PrototypeMapId } from './prototype-maps';

/** A line strung from one cell to another, as `data.js` writes it. */
export interface Span {
  readonly from: Cell;
  readonly to: Cell;
}

/** What only the drawing reads of a map. */
export interface MapDecor {
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

/** One map as the client draws and picks on it. */
export interface Terrain {
  readonly id: PrototypeMapId;
  /** The map's own data: its tiles, its props and the prototype's demo spawns. */
  readonly map: PrototypeMap;
  readonly size: BoardSize;
  /** How far the prototype lowers the whole map, in its own pixels. Only the rooftop has one. */
  readonly lift: number;
  /** Whether a cell is a gap with no floor under it. */
  readonly isVoid: (cell: Cell) => boolean;
  /** The height of a cell, or `NO_FLOOR` when it has none. Off the board there is no floor either. */
  readonly levelAt: (cell: Cell) => number;
  readonly decor: MapDecor;
}

/** The drawings of `data.js` that are not props, map by map. */
const DECOR: Record<PrototypeMapId, MapDecor> = {
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

/** The map a match is played on, by the id the state carries. */
export function terrainOf(id: PrototypeMapId): Terrain {
  const map = PROTOTYPE_MAPS.find((candidate) => candidate.id === id);
  if (map === undefined) throw new Error(`unknown map: ${id}`);

  const size = { width: map.tiles[0]?.length ?? 0, height: map.tiles.length };
  const heightOf = (cell: Cell): number | undefined => map.heights[cell.y]?.[cell.x];
  const isVoid = (cell: Cell) => heightOf(cell) === map.void;

  return {
    id: map.id,
    map,
    size,
    lift: map.lift,
    isVoid,
    levelAt: (cell) => {
      const height = heightOf(cell);
      return height === undefined || height === map.void ? NO_FLOOR : height;
    },
    decor: DECOR[map.id],
  };
}

/** The props of one cell of a map, in the order `data.js` lists them. */
export function propsAt(map: PrototypeMap, cell: Cell): PropSpec[] {
  return map.props.filter((prop) => prop.x === cell.x && prop.y === cell.y);
}
