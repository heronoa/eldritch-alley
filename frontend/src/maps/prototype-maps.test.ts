// Map fidelity M1 — the prototype's three maps as data, in the shape the client draws them.
//
// This is the frontend's half of `backend/game-server/src/maps/prototype-maps.test.ts`: the same
// constants and the same cases, against the client's copy of the data. The two copies are checked
// against each other by checking both against the generator's numbers — a drift on either side fails
// that side's own suite.
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { PROTOTYPE_MAPS, PROTOTYPE_TILE_LETTERS, type PrototypeMapId } from './prototype-maps';
// The server's copy of the same data. Comparing the two directly, not only their constants, is what catches
// an edit that changes one copy and leaves the other alone (DT-62).
import * as serverCopy from '../../../backend/game-server/src/maps/prototype-maps';
import { setLocale } from '../i18n/translate';

// The cases below assert the Portuguese copy the game shipped with, so they read it on purpose.
setLocale('pt-BR');

/** What the generator recorded for one map. */
interface Checksum {
  /** The sum of the heights, the void cells left out. */
  readonly sum: number;
  readonly voidCells: number;
  readonly letters: Readonly<Record<string, number>>;
  readonly props: Readonly<Record<string, number>>;
}

const CHECKSUMS: Readonly<Record<PrototypeMapId, Checksum>> = {
  street: {
    sum: 151,
    voidCells: 0,
    letters: { B: 36, s: 18, a: 14, z: 2, x: 7, f: 23 },
    props: {
      lamp: 5, car: 5, moto: 1, traffic: 2, trash: 2, hydrant: 1, manhole: 2,
      puddle: 2, flyers: 1, leak: 1, tape: 2, crates: 1, dumpster: 1, bags: 1,
    },
  },
  park: {
    sum: 178,
    voidCells: 0,
    letters: { B: 19, g: 51, p: 17, w: 4, q: 9 },
    props: { tree: 7, bush: 4, bench: 2, lamp: 3, fountain: 1, leak: 1, tape: 2 },
  },
  roof: {
    sum: 558,
    voidCells: 9,
    letters: { R: 13, r: 71, v: 9, B: 6, k: 1 },
    props: {
      tower: 1, antenna: 1, dish: 1, ac: 2, skylight: 1, vent: 3, puddle: 1,
      solar: 2, crates: 1, chalk: 1, leak: 1, tape: 2, pole: 2,
    },
  },
};

/** The prototype's demo units: id, class, team, cell — in the order `data.js` lists them. */
type DemoUnit = readonly [string, string, 'ally' | 'enemy', number, number];

const DEMO_UNITS: Readonly<Record<PrototypeMapId, readonly DemoUnit[]>> = {
  street: [
    ['aS', 'S', 'ally', 4, 9], ['aW', 'W', 'ally', 3, 9], ['aP', 'P', 'ally', 5, 9],
    ['eS', 'S', 'enemy', 4, 1], ['eW', 'W', 'enemy', 1, 2], ['eP', 'P', 'enemy', 7, 1],
  ],
  park: [
    ['aS', 'S', 'ally', 5, 9], ['aW', 'W', 'ally', 4, 9], ['aP', 'P', 'ally', 6, 9],
    ['eS', 'S', 'enemy', 8, 3], ['eW', 'W', 'enemy', 9, 4], ['eP', 'P', 'enemy', 8, 5],
  ],
  roof: [
    ['aS', 'S', 'ally', 1, 8], ['aW', 'W', 'ally', 0, 9], ['aP', 'P', 'ally', 1, 9],
    ['eS', 'S', 'enemy', 7, 7], ['eW', 'W', 'enemy', 8, 3], ['eP', 'P', 'enemy', 1, 1],
  ],
};

/** The name the prototype prints above each map. The data carries the key, not the text. */
const PROTOTYPE_TITLES: Readonly<Record<PrototypeMapId, string>> = {
  street: 'Rua do Comércio e beco',
  park: 'Praça Municipal nº 3',
  roof: 'Edifício Central, cobertura',
};

/** How many times each value appears, which is how a count is compared without its order mattering. */
function counted(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

const ofTeam = (id: PrototypeMapId, team: 'ally' | 'enemy'): readonly DemoUnit[] =>
  DEMO_UNITS[id].filter((unit) => unit[2] === team);

const cellOf = (unit: DemoUnit): { x: number; y: number } => ({ x: unit[3], y: unit[4] });

describe.each(PROTOTYPE_MAPS)('the $id map', (map) => {
  const checksum = CHECKSUMS[map.id];

  it('is ten rows of ten letters the prototype defines', () => {
    expect(map.tiles).toHaveLength(10);

    for (const [y, row] of map.tiles.entries()) {
      expect(row, `row ${y}`).toHaveLength(10);

      for (const [x, letter] of [...row].entries()) {
        expect(PROTOTYPE_TILE_LETTERS, `${x},${y} is ${letter}`).toContain(letter);
      }
    }
  });

  it('holds one height per cell, and the sums and counts the generator recorded', () => {
    expect(map.heights).toHaveLength(10);
    for (const [y, row] of map.heights.entries()) expect(row, `row ${y}`).toHaveLength(10);

    const heights = map.heights.flat();
    // `map.void` is NaN on the maps without a gap, and NaN matches nothing — which is the point:
    // no cell of those maps is ever void.
    const voids = heights.filter((height) => height === map.void);
    const solid = heights.filter((height) => height !== map.void);

    expect(voids).toHaveLength(checksum.voidCells);
    expect(solid.reduce((sum, height) => sum + height, 0)).toBe(checksum.sum);
    expect(counted([...map.tiles.join('')])).toEqual(checksum.letters);
  });

  it('carries the props of the prototype, counted by type', () => {
    expect(counted(map.props.map((prop) => prop.t))).toEqual(checksum.props);
  });

  it('lands the two squads on the prototype demo positions, in its own order', () => {
    expect(map.spawns.A).toEqual(ofTeam(map.id, 'ally').map(cellOf));
    expect(map.spawns.B).toEqual(ofTeam(map.id, 'enemy').map(cellOf));

    // The roster of a match walks a squad's spawns with the sniper first, then the wizard, then the
    // priest, so the prototype's own order is the one that keeps the two in step.
    expect(ofTeam(map.id, 'ally').map((unit) => unit[1])).toEqual(['S', 'W', 'P']);
    expect(ofTeam(map.id, 'enemy').map((unit) => unit[1])).toEqual(['S', 'W', 'P']);
  });

  it('names the map, its sky and its lift as the prototype does', () => {
    expect(t(map.title)).toBe(PROTOTYPE_TITLES[map.id]);
    expect(map.sky).toBe(map.id);
    expect(map.lift).toBeGreaterThanOrEqual(0);
  });
});

describe('the map set', () => {
  it('ships the three prototype maps, in the order the game walks them', () => {
    expect(PROTOTYPE_MAPS.map((map) => map.id)).toEqual(['street', 'park', 'roof']);
    // The map carries a message key, and resolving it gives the name the prototype prints.
    expect(PROTOTYPE_MAPS.map((map) => map.title)).toEqual([
      'map.street.title',
      'map.park.title',
      'map.roof.title',
    ]);
    expect(PROTOTYPE_MAPS.map((map) => t(map.title))).toEqual([
      'Rua do Comércio e beco',
      'Praça Municipal nº 3',
      'Edifício Central, cobertura',
    ]);
    // The rooftop is the only map the prototype lifts, to make room for the street below it.
    expect(PROTOTYPE_MAPS.map((map) => map.lift)).toEqual([0, 0, 40]);
    // Only the rooftop has a gap, and its value is the prototype's own.
    expect(PROTOTYPE_MAPS.map((map) => map.void)).toEqual([Number.NaN, Number.NaN, -10]);
  });

  it('is the same data as the server\'s copy, map by map and field by field', () => {
    expect(PROTOTYPE_MAPS).toEqual(serverCopy.PROTOTYPE_MAPS);
    expect(PROTOTYPE_TILE_LETTERS).toEqual(serverCopy.PROTOTYPE_TILE_LETTERS);
  });
});
