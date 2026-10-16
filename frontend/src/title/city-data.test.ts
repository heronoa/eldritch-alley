// Title screen M1 — the frozen city of `city-data.ts`, checked against what the prototype's loop
// produces: the shape of the two grids, the props, and the checksum the generator recorded.
import { describe, expect, it } from 'vitest';
import { HEIGHT_ROWS, PROPS, TILE_ROWS } from './city-data';

/** What the prototype's loop produces for the city. The generator that wrote the data recorded it. */
const CHECKSUM = {
  /** The sum of every height, the plaza's cap included. */
  sum: 405,
  /** How many cells carry the building letter `B`. */
  buildings: 119,
} as const;

describe('TILE_ROWS', () => {
  it('is sixteen rows of sixteen letters', () => {
    expect(TILE_ROWS).toHaveLength(16);
    for (const row of TILE_ROWS) expect(row).toHaveLength(16);
  });

  it('uses only the letters the prototype draws', () => {
    for (const row of TILE_ROWS) expect(row).toMatch(/^[Bazsg]{16}$/);
  });
});

describe('HEIGHT_ROWS', () => {
  it('is sixteen rows of sixteen numbers', () => {
    expect(HEIGHT_ROWS).toHaveLength(16);
    for (const row of HEIGHT_ROWS) expect(row).toHaveLength(16);
  });

  it('gives every cell a whole number of levels', () => {
    for (const row of HEIGHT_ROWS) {
      for (const height of row) {
        expect(Number.isInteger(height)).toBe(true);
        expect(height).toBeGreaterThanOrEqual(0);
        // The prototype's formula: four floors plus up to four more, `4 + r % 5`.
        expect(height).toBeLessThanOrEqual(8);
      }
    }
  });

  it('raises the buildings and nothing else', () => {
    for (let y = 0; y < TILE_ROWS.length; y++) {
      for (let x = 0; x < TILE_ROWS[y].length; x++) {
        if (TILE_ROWS[y][x] === 'B') expect(HEIGHT_ROWS[y][x]).toBeGreaterThan(0);
        else expect(HEIGHT_ROWS[y][x]).toBe(0);
      }
    }
  });
});

describe('PROPS', () => {
  const count = (kind: string) => PROPS.filter((prop) => prop.kind === kind).length;

  it('is the prototype list: eight lamps, four cars, four trees, two leaks', () => {
    expect(count('lamp')).toBe(8);
    expect(count('car')).toBe(4);
    expect(count('tree')).toBe(4);
    expect(count('leak')).toBe(2);
    expect(PROPS).toHaveLength(18);
  });

  it('stands every prop on a cell of the grid', () => {
    for (const prop of PROPS) {
      expect(prop.x).toBeGreaterThanOrEqual(0);
      expect(prop.x).toBeLessThan(16);
      expect(prop.y).toBeGreaterThanOrEqual(0);
      expect(prop.y).toBeLessThan(16);
    }
  });

  it('paints every car, and parks two of them across the street', () => {
    const cars = PROPS.filter((prop) => prop.kind === 'car');
    for (const car of cars) expect(car.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(cars.filter((car) => car.vertical)).toHaveLength(2);
  });
});

describe('the city checksum', () => {
  it('sums the heights to the number the generator printed', () => {
    const sum = HEIGHT_ROWS.flat().reduce((total, height) => total + height, 0);
    expect(sum).toBe(CHECKSUM.sum);
  });

  it('counts the building cells the generator counted', () => {
    const buildings = TILE_ROWS.flatMap((row) => [...row]).filter((letter) => letter === 'B').length;
    expect(buildings).toBe(CHECKSUM.buildings);
  });
});
