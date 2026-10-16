// A rotation is a reading, not a change (DT-87). The map data in the client is shared by every match
// on that map, so a view that wrote to it would leave the next match — and the other three views —
// drawing a board nobody asked for. These tests pin that down: `terrainOf` may build whatever it likes
// on the way, but the data it read has to come out exactly as it went in.
import { describe, expect, it } from 'vitest';
import { PROTOTYPE_MAPS } from './prototype-maps';
import { propsAt, terrainOf } from './terrain';
import { rotateCell } from '../view/rotation';
import { NO_FLOOR } from '../view/grid';

/** The maps as they are before any test touches them, so a leak from one test cannot hide in another. */
const SOURCE = structuredClone(PROTOTYPE_MAPS);

const VIEWS = [0, 1, 2, 3];

describe('reading a map through a view', () => {
  it('leaves the map data in the client untouched, in every view', () => {
    for (const map of PROTOTYPE_MAPS) {
      for (const steps of VIEWS) terrainOf(map.id, steps);
    }

    expect(PROTOTYPE_MAPS).toEqual(SOURCE);
  });

  it('reads the same map the same way every time', () => {
    for (const map of PROTOTYPE_MAPS) {
      // The two lookups are closures built fresh on each read, so only the data they answer for is
      // compared here; their answers are checked by the tests below.
      for (const steps of VIEWS) {
        const first = terrainOf(map.id, steps);
        const second = terrainOf(map.id, steps);

        expect({ ...first, isVoid: null, levelAt: null }).toEqual({ ...second, isVoid: null, levelAt: null });
      }
    }
  });

  it('keeps every tile and every height of the map, only moved', () => {
    for (const map of PROTOTYPE_MAPS) {
      const flat = (values: readonly (readonly number[])[]) => values.flat().sort((a, b) => a - b);

      for (const steps of VIEWS) {
        const turned = terrainOf(map.id, steps);
        const same = turned.map.tiles.join('').split('').sort();
        const source = map.tiles.join('').split('').sort();

        expect(same).toEqual(source);
        expect(flat(turned.map.heights)).toEqual(flat(map.heights));
      }
    }
  });

  it('draws the map as it is written when the view is the map’s own', () => {
    for (const map of PROTOTYPE_MAPS) {
      const terrain = terrainOf(map.id, 0);

      expect(terrain.map.tiles).toEqual(map.tiles);
      expect(terrain.map.heights).toEqual(map.heights);
      expect(terrain.size).toEqual({ width: map.tiles[0].length, height: map.tiles.length });
      expect(terrain.props).toEqual(map.props.map((prop) => ({ ...prop, view: 0 })));
    }
  });

  it('shows a turned cell the height of the cell it came from', () => {
    for (const map of PROTOTYPE_MAPS) {
      const base = { width: map.tiles[0].length, height: map.tiles.length };
      const terrain = terrainOf(map.id, 1);

      for (let y = 0; y < base.height; y += 1) {
        for (let x = 0; x < base.width; x += 1) {
          const height = map.heights[y][x];
          const expected = height === map.void ? NO_FLOOR : height;

          expect(terrain.levelAt(rotateCell({ x, y }, 1, base))).toBe(expected);
        }
      }
    }
  });

  it('comes back to the map it started from after four turns', () => {
    for (const map of PROTOTYPE_MAPS) {
      const first = terrainOf(map.id, 0);
      const round = terrainOf(map.id, 4);

      expect(round.map.tiles).toEqual(first.map.tiles);
      expect(round.map.heights).toEqual(first.map.heights);
      expect(round.size).toEqual(first.size);
      expect(round.props).toEqual(first.props);
    }
  });

  it('finds a prop of the turned map where the view put it', () => {
    for (const map of PROTOTYPE_MAPS) {
      if (map.props.length === 0) continue;

      const prop = map.props[0];
      const base = { width: map.tiles[0].length, height: map.tiles.length };
      const at = rotateCell(prop, 1, base);

      expect(propsAt(terrainOf(map.id, 1), at)).toHaveLength(
        map.props.filter((candidate) => candidate.x === prop.x && candidate.y === prop.y).length,
      );
    }
  });
});

describe('turning a single cell', () => {
  it('leaves the cell it was handed alone', () => {
    const cell = { x: 1, y: 2 };
    const before = structuredClone(cell);

    rotateCell(cell, 1, { width: 8, height: 8 });

    expect(cell).toEqual(before);
  });
});
