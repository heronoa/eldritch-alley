// Title screen M1 — the city behind the title, frozen as data.
//
// The tiles, the heights and the props are what the prototype builds at load time in
// `.ia_context/prototypes/eldritch-alley-title-screen/js/title-screen.js`, written out once by a
// generator kept outside the repository (section 4.1 of the M1 plan). The sums and the counts in
// `city-data.test.ts` are that generator's record, so an edit to any number here fails the suite
// instead of changing the skyline in silence.

/** One of the prototype's props. `color` is the body a car carries, `vertical` a car across the street. */
export interface Prop {
  readonly kind: 'lamp' | 'car' | 'tree' | 'leak';
  readonly x: number;
  readonly y: number;
  readonly color?: string;
  readonly vertical?: boolean;
}

/**
 * Sixteen rows of sixteen tiles, in the prototype's letters: `B` building, `a` asphalt, `z` crosswalk,
 * `s` sidewalk, `g` grass. Two streets cross the block and a small square of grass sits in its
 * south-west corner.
 */
export const TILE_ROWS: readonly string[] = [
  'BBBBBBBsaasBBBBB',
  'BBBBBBBsaasBBBBB',
  'BBBBBBBsaasBBBBB',
  'BBBBBBBsaasBBBBB',
  'BBBBBBBsaasBBBBB',
  'sssssssszzssssss',
  'aaaaaaazaazaaaaa',
  'aaaaaaazaazaaaaa',
  'sssssssszzssssss',
  'BBBBBBBsaasBBBBB',
  'BgggggBsaasBBBBB',
  'BgggggBsaasBBBBB',
  'BgggggBsaasBBBBB',
  'BgggggBsaasBBBBB',
  'BgggggBsaasBBBBB',
  'BBBBBBBsaasBBBBB',
];

/**
 * The height of every cell, in levels. Buildings only: the prototype's `(x * 73 + y * 151) % 17`
 * decides them, one to eight levels, and the edge of the square is capped at two.
 */
export const HEIGHT_ROWS: readonly (readonly number[])[] = [
  [4, 4, 4, 4, 7, 7, 7, 0, 0, 0, 0, 8, 3, 4, 4, 5],
  [4, 7, 7, 7, 5, 5, 5, 0, 0, 0, 0, 4, 5, 2, 2, 3],
  [7, 5, 5, 5, 5, 8, 8, 0, 0, 0, 0, 2, 3, 4, 5, 5],
  [5, 5, 8, 8, 8, 6, 6, 0, 0, 0, 0, 5, 5, 2, 3, 3],
  [8, 8, 6, 6, 6, 4, 4, 0, 0, 0, 0, 3, 3, 4, 5, 2],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 5, 2, 2, 2, 1],
  [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 1, 2, 1, 1],
  [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 1, 2, 1, 1],
  [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 1, 2, 1, 1],
  [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 1, 2, 1, 2],
  [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 2, 2, 1, 2],
  [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 1, 2, 2, 1, 2],
];

/** Everything that stands on the city: eight lamps, four cars, four trees and two leaks. */
export const PROPS: readonly Prop[] = [
  { kind: 'lamp', x: 7, y: 4 },
  { kind: 'lamp', x: 10, y: 4 },
  { kind: 'lamp', x: 6, y: 8 },
  { kind: 'lamp', x: 11, y: 8 },
  { kind: 'lamp', x: 7, y: 11 },
  { kind: 'lamp', x: 10, y: 12 },
  { kind: 'lamp', x: 3, y: 5 },
  { kind: 'lamp', x: 13, y: 5 },
  { kind: 'car', x: 3, y: 6, color: '#4a2830' },
  { kind: 'car', x: 12, y: 7, color: '#2d3a55' },
  { kind: 'car', x: 8, y: 2, color: '#3d4152', vertical: true },
  { kind: 'car', x: 9, y: 12, color: '#4a3e22', vertical: true },
  { kind: 'tree', x: 2, y: 11 },
  { kind: 'tree', x: 5, y: 13 },
  { kind: 'tree', x: 1, y: 14 },
  { kind: 'tree', x: 4, y: 10 },
  { kind: 'leak', x: 3, y: 12 },
  { kind: 'leak', x: 12, y: 3 },
];
