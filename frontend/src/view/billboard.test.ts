import { describe, expect, it } from 'vitest';
import type { BoardSize } from './grid';
import { rotateCell } from './rotation';
import { type BillboardUnit, facesRight } from './billboard';

const SIZE: BoardSize = { width: 10, height: 10 };

function unit(team: BillboardUnit['team'], x: number, y: number, dead = false): BillboardUnit {
  return { team, position: { x, y }, permanentlyDead: dead };
}

/** A squad seen from `steps` turns round the map. */
function seen(units: BillboardUnit[], steps: number): BillboardUnit[] {
  return units.map((u) => ({ ...u, position: rotateCell(u.position, steps, SIZE) }));
}

describe('facesRight', () => {
  it('turns a unit towards the enemy that stands to the right of it', () => {
    const ally = unit('A', 2, 6);
    const enemy = unit('B', 6, 2);

    expect(facesRight(ally, [ally, enemy])).toBe(true);
  });

  it('turns it towards the enemy that stands to the left of it', () => {
    const ally = unit('A', 6, 2);
    const enemy = unit('B', 2, 6);

    expect(facesRight(ally, [ally, enemy])).toBe(false);
  });

  it('faces the middle of the enemy squad, not the nearest soldier of it', () => {
    // The one enemy in front is to the left of the unit; the two behind it, on average, are not.
    const ally = unit('A', 5, 5);
    const enemies = [unit('B', 3, 5), unit('B', 7, 5), unit('B', 8, 4)];

    expect(facesRight(ally, [ally, ...enemies])).toBe(true);
  });

  it('pays no attention to its own side', () => {
    const ally = unit('A', 5, 5);
    const enemy = unit('B', 6, 5);
    const faraway = unit('A', 0, 9);

    expect(facesRight(ally, [ally, enemy, faraway])).toBe(true);
  });

  it('pays no attention to an enemy whose body has left the map', () => {
    const ally = unit('A', 5, 5);
    const enemy = unit('B', 6, 5);
    const gone = unit('B', 0, 9, true);

    expect(facesRight(ally, [ally, enemy, gone])).toBe(true);
  });

  it('falls back to the side its team always faces when no enemy is left', () => {
    const ally = unit('A', 5, 5);
    const other = unit('B', 5, 5);

    expect(facesRight(ally, [ally])).toBe(true);
    expect(facesRight(other, [other])).toBe(false);
  });

  it('keeps facing the enemy squad through all four views', () => {
    const squad = [unit('A', 5, 5), unit('B', 7, 5), unit('B', 6, 4)];

    const facing = [0, 1, 2, 3].map((steps) => {
      const inView = seen(squad, steps);
      return facesRight(inView[0], inView);
    });

    expect(facing).toEqual([true, false, false, true]);
  });
});
