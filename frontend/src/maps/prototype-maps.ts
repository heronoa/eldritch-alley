// Map fidelity M1 — the three maps of `.ia_context/prototypes/eldritch-alley-map-prototype/`, as the
// prototype itself computes them.
//
// The tiles, the props and the demo positions are `js/data.js` verbatim. The heights are not: `data.js`
// builds them at load time from `hmap`, `h` and `heights`, then adds `hill`, so they are computed once
// by the generator of section 4.1 of the plan and written here as the table it printed — the sums and
// counts in `prototype-maps.test.ts` are that generator's record.
//
// `void` is the height that marks a gap, the rooftop's -10. On the maps without one it is NaN, and NaN
// matching no height is exactly the meaning wanted: nothing on those maps is ever void.
//
// A copy of this file lives at `backend/game-server/src/maps/prototype-maps.ts`, the way `protocol.ts` is copied.
// The two are held together by the checksums in each side's `prototype-maps.test.ts`.
//
// One quirk worth knowing before porting the drawing (M2): `data.js` declares the tile letter `k`
// twice — the plank over the gap first, then the neighbour roof — so the second one wins and the
// rooftop's plank is drawn in the neighbour-roof tone. That is the prototype's own output, and this
// data is the prototype's.

/** Which of the three maps this is. */
export type PrototypeMapId = 'street' | 'park' | 'roof';

/** A cell of the ten-by-ten grid. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** One prop, exactly as `data.js` lists it. `c` is the body colour a car carries. */
export interface PropSpec {
  readonly t: string;
  readonly x: number;
  readonly y: number;
  readonly c?: string;
}

/** One of the prototype's maps: its relief, its props and where its two squads start. */
export interface PrototypeMap {
  readonly id: PrototypeMapId;
  /** The name the prototype prints above the map. Nothing draws it yet. */
  readonly title: string;
  /** Ten rows of ten tile letters, as `data.js` writes them. */
  readonly tiles: readonly string[];
  /** Ten rows of ten heights: the prototype's own, 0 to 11, with `void` where there is a gap. */
  readonly heights: readonly (readonly number[])[];
  /** The height that marks a gap — the rooftop's `-10`. NaN on a map without one, and NaN matches
   * no height, so nothing on those maps is ever void. */
  readonly void: number;
  /** How far the prototype lowers the whole map, in its own pixels. Only the rooftop has one. */
  readonly lift: number;
  /** Which sky the prototype paints behind it. */
  readonly sky: PrototypeMapId;
  readonly props: readonly PropSpec[];
  /** Where each squad starts, in the prototype's own order: sniper, wizard, priest. */
  readonly spawns: { readonly A: readonly Cell[]; readonly B: readonly Cell[] };
}

/** Every letter `data.js` gives a tile to, which is what a map's rows may use. */
export const PROTOTYPE_TILE_LETTERS: readonly string[] = ['B', 'R', 'a', 'b', 'd', 'f', 'g', 'h', 'k', 'p', 'q', 'r', 's', 'v', 'w', 'x', 'z'];

/** The height of a gap on the maps that have one. */
const VOID = -10;

const STREET: PrototypeMap = {
  id: 'street',
  title: 'Rua do Comércio e beco',
  tiles: [
      'BBBBBBBBBB',
      'BssssssssB',
      'BaaaazaaaB',
      'BaaaazaaaB',
      'BssssssssB',
      'BBBBxfffff',
      'BBBxxfffff',
      'BBBBxxffff',
      'BBBBxfffff',
      'BBBsxsffff',
  ],
  heights: [
      [6, 7, 6, 7, 7, 6, 7, 6, 7, 6],
      [5, 0, 0, 0, 0, 0, 0, 0, 0, 3],
      [5, 0, 0, 0, 0, 0, 0, 0, 0, 3],
      [5, 0, 0, 0, 0, 0, 0, 0, 0, 3],
      [5, 0, 0, 0, 0, 0, 0, 0, 0, 3],
      [3, 3, 3, 3, 0, 0, 0, 0, 0, 0],
      [3, 3, 3, 0, 0, 0, 0, 0, 0, 0],
      [3, 3, 3, 3, 0, 0, 0, 0, 0, 0],
      [3, 3, 3, 3, 0, 0, 0, 0, 0, 0],
      [3, 3, 3, 0, 0, 0, 0, 0, 0, 0],
  ],
  void: Number.NaN,
  lift: 0,
  sky: 'street',
  props: [
      { t: 'lamp', x: 2, y: 1 },
      { t: 'lamp', x: 7, y: 1 },
      { t: 'lamp', x: 2, y: 4 },
      { t: 'lamp', x: 7, y: 4 },
      { t: 'lamp', x: 4, y: 7 },
      { t: 'car', x: 2, y: 2, c: '#4a2830' },
      { t: 'car', x: 7, y: 3, c: '#2d3a55' },
      { t: 'car', x: 8, y: 2, c: '#3d4152' },
      { t: 'moto', x: 1, y: 3 },
      { t: 'traffic', x: 3, y: 1 },
      { t: 'traffic', x: 5, y: 4 },
      { t: 'trash', x: 6, y: 4 },
      { t: 'hydrant', x: 8, y: 1 },
      { t: 'manhole', x: 6, y: 2 },
      { t: 'puddle', x: 3, y: 3 },
      { t: 'flyers', x: 1, y: 4 },
      { t: 'leak', x: 5, y: 1 },
      { t: 'tape', x: 4, y: 1 },
      { t: 'tape', x: 6, y: 1 },
      { t: 'crates', x: 3, y: 6 },
      { t: 'dumpster', x: 5, y: 7 },
      { t: 'bags', x: 4, y: 6 },
      { t: 'puddle', x: 4, y: 5 },
      { t: 'manhole', x: 4, y: 8 },
      { t: 'car', x: 7, y: 6, c: '#2d3a55' },
      { t: 'car', x: 8, y: 8, c: '#3a3f55' },
      { t: 'trash', x: 9, y: 7 },
  ],
  // The prototype's own demo units: the sniper, then the wizard, then the priest, per side.
  spawns: { A: [{ x: 4, y: 9 }, { x: 3, y: 9 }, { x: 5, y: 9 }], B: [{ x: 4, y: 1 }, { x: 1, y: 2 }, { x: 7, y: 1 }] },
};

const PARK: PrototypeMap = {
  id: 'park',
  title: 'Praça Municipal nº 3',
  tiles: [
      'BBBBBBBBBB',
      'Bgggpggggg',
      'Bgwwpggggg',
      'Bgwwpppppp',
      'Bgggpggggg',
      'Bpppqqqppp',
      'Bgggqqqggg',
      'Bgggqqqggg',
      'Bggggpgggg',
      'Bggggpgggg',
  ],
  heights: [
      [4, 6, 5, 5, 4, 4, 4, 5, 5, 6],
      [6, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [5, 1, 0, 0, 1, 1, 1, 1, 1, 1],
      [5, 1, 0, 0, 1, 1, 1, 1, 1, 1],
      [4, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [4, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [4, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [5, 1, 1, 1, 1, 1, 1, 2, 2, 1],
      [5, 1, 1, 1, 1, 1, 1, 2, 3, 2],
      [6, 1, 1, 1, 1, 1, 1, 1, 2, 3],
  ],
  void: Number.NaN,
  lift: 0,
  sky: 'park',
  props: [
      { t: 'tree', x: 2, y: 1 },
      { t: 'tree', x: 7, y: 1 },
      { t: 'tree', x: 9, y: 2 },
      { t: 'tree', x: 6, y: 2 },
      { t: 'tree', x: 1, y: 7 },
      { t: 'tree', x: 3, y: 8 },
      { t: 'tree', x: 8, y: 8 },
      { t: 'bush', x: 3, y: 4 },
      { t: 'bush', x: 7, y: 4 },
      { t: 'bush', x: 2, y: 6 },
      { t: 'bush', x: 9, y: 6 },
      { t: 'bench', x: 3, y: 6 },
      { t: 'bench', x: 7, y: 6 },
      { t: 'lamp', x: 4, y: 4 },
      { t: 'lamp', x: 7, y: 5 },
      { t: 'lamp', x: 1, y: 3 },
      { t: 'fountain', x: 5, y: 6 },
      { t: 'leak', x: 2, y: 8 },
      { t: 'tape', x: 2, y: 9 },
      { t: 'tape', x: 1, y: 8 },
  ],
  // The prototype's own demo units: the sniper, then the wizard, then the priest, per side.
  spawns: { A: [{ x: 5, y: 9 }, { x: 4, y: 9 }, { x: 6, y: 9 }], B: [{ x: 8, y: 3 }, { x: 9, y: 4 }, { x: 8, y: 5 }] },
};

const ROOF: PrototypeMap = {
  id: 'roof',
  title: 'Edifício Central, cobertura',
  tiles: [
      'RRRrrrvBBB',
      'RRRrrrvBBB',
      'RRrrrrvrrr',
      'rrrrrrvrrr',
      'rrrrrrkrrr',
      'rrrrrrvrrr',
      'rrrrrrvRRr',
      'rrrrrrvRRr',
      'rrrrrrvRrr',
      'rrrrrrvrrr',
  ],
  heights: [
      [8, 8, 7, 6, 6, 6, VOID, 11, 11, 11],
      [8, 8, 7, 6, 6, 6, VOID, 11, 11, 11],
      [7, 7, 7, 6, 6, 6, VOID, 5, 5, 6],
      [6, 6, 6, 6, 6, 6, VOID, 5, 5, 6],
      [6, 6, 6, 6, 6, 6, 6, 5, 5, 5],
      [6, 6, 6, 6, 6, 6, VOID, 5, 5, 5],
      [5, 5, 6, 6, 6, 6, VOID, 6, 6, 5],
      [4, 5, 6, 6, 6, 6, VOID, 7, 6, 5],
      [4, 4, 5, 6, 6, 6, VOID, 6, 5, 5],
      [4, 4, 5, 6, 6, 6, VOID, 5, 5, 5],
  ],
  void: -10,
  lift: 40,
  sky: 'roof',
  props: [
      { t: 'tower', x: 0, y: 0 },
      { t: 'antenna', x: 1, y: 0 },
      { t: 'dish', x: 0, y: 2 },
      { t: 'ac', x: 4, y: 1 },
      { t: 'ac', x: 5, y: 1 },
      { t: 'skylight', x: 3, y: 4 },
      { t: 'vent', x: 2, y: 3 },
      { t: 'vent', x: 5, y: 9 },
      { t: 'puddle', x: 4, y: 6 },
      { t: 'solar', x: 7, y: 2 },
      { t: 'solar', x: 8, y: 2 },
      { t: 'crates', x: 9, y: 8 },
      { t: 'vent', x: 9, y: 5 },
      { t: 'chalk', x: 3, y: 7 },
      { t: 'leak', x: 3, y: 7 },
      { t: 'tape', x: 2, y: 7 },
      { t: 'tape', x: 3, y: 8 },
      { t: 'pole', x: 4, y: 3 },
      { t: 'pole', x: 5, y: 6 },
  ],
  // The prototype's own demo units: the sniper, then the wizard, then the priest, per side.
  spawns: { A: [{ x: 1, y: 8 }, { x: 0, y: 9 }, { x: 1, y: 9 }], B: [{ x: 7, y: 7 }, { x: 8, y: 3 }, { x: 1, y: 1 }] },
};

/** The three maps, in the order the game walks them. */
export const PROTOTYPE_MAPS: readonly PrototypeMap[] = [STREET, PARK, ROOF];
