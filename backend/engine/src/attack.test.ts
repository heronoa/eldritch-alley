import { describe, expect, it } from 'vitest';
import { attackArea } from './attack';
import { newMatch } from './match';
import type { Board, MatchSetup, MatchState, Position, Team, Unit, UnitState } from './types';

function makeBoard(heights: Record<string, number> = {}): Board {
  const levels = new Array<number>(64).fill(0);
  for (const [key, level] of Object.entries(heights)) {
    const [x, y] = key.split(',').map(Number);
    levels[y * 8 + x] = level;
  }
  return { width: 8, height: 8, levels };
}

function makeUnit(overrides: Partial<Unit> & Pick<Unit, 'id' | 'team' | 'position'>): Unit {
  return {
    speed: 1,
    health: 10,
    attack: 3,
    hitChance: 100,
    range: 1,
    movement: 4,
    nerve: 50,
    magazine: null,
    attunement: 50,
    primaryClass: 'soldier',
    equipment: {
      armor: null,
      helmet: null,
      mainHand: null,
      offHand: null,
      accessory1: null,
      accessory2: null,
    },
    abilities: { activeSets: [null, null], reaction: null, movement: null, support: null },
    ...overrides,
  };
}

/** A match of the given units on the given board. The sniper in these cases is always team A. */
function makeSetup(units: Unit[], heights: Record<string, number> = {}): MatchSetup {
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed: 1, map: makeBoard(heights), teams: [team('A'), team('B')] };
}

function unitAt(state: MatchState, id: string): UnitState {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit with id ${id}`);
  return unit;
}

/** Cells as `x,y` strings, sorted, so two areas are compared as sets and not as lists. */
function keys(cells: readonly Position[]): string[] {
  return cells.map((cell) => `${cell.x},${cell.y}`).sort();
}

/** A sniper of range 3 on the ground, and an enemy far away in the corner. */
function sniperAt(position: Position, heights: Record<string, number> = {}): MatchState {
  return newMatch(
    makeSetup(
      [
        makeUnit({ id: 'a1', team: 'A', position, speed: 10, range: 3, magazine: 3 }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
      ],
      heights,
    ),
  );
}

describe('attackArea', () => {
  it('covers the 7x7 square around a sniper of range 3, minus the cell it stands on', () => {
    const state = sniperAt({ x: 3, y: 3 });
    const sniper = unitAt(state, 'a1');

    const area = attackArea(state, sniper.position, sniper);

    // Every cell within a Chebyshev distance of 3, the one it stands on left out: 49 - 1.
    expect(area).toHaveLength(48);
    expect(keys(area)).toEqual(expect.arrayContaining(['0,0', '6,0', '0,6', '6,6']));
    expect(area).not.toContainEqual({ x: 3, y: 3 });
    // The reach is 3, so the fourth ring is out of it.
    expect(area).not.toContainEqual({ x: 7, y: 3 });
    expect(area.every((cell) => cell.x <= 6 && cell.y <= 6)).toBe(true);
  });

  it('leaves out the cells a building takes away, and keeps the cells beside it', () => {
    // A wall on the cell next to the unit: the two cells of the row behind it are out of sight.
    const state = sniperAt({ x: 0, y: 0 }, { '1,0': 5 });
    const sniper = unitAt(state, 'a1');

    const area = keys(attackArea(state, sniper.position, sniper));

    expect(area).not.toContain('2,0');
    expect(area).not.toContain('3,0');
    // The building is one cell, not a wall across the map: the cells around it stay in the area.
    expect(area).toContain('1,0');
    expect(area).toContain('0,1');
    expect(area).toContain('1,1');
  });

  it('counts cells, not enemies: a cell with a unit on it is in the area like an empty one', () => {
    const state = newMatch(
      makeSetup([
        makeUnit({ id: 'a1', team: 'A', position: { x: 3, y: 3 }, speed: 10, range: 2, magazine: 3 }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 4, y: 3 }, speed: 1 }),
      ]),
    );
    const sniper = unitAt(state, 'a1');

    const area = attackArea(state, sniper.position, sniper);

    expect(area).toHaveLength(24); // the 5x5 square of reach 2, minus the cell it stands on
    expect(area).toContainEqual({ x: 4, y: 3 }); // the enemy
    expect(area).toContainEqual({ x: 3, y: 5 }); // an empty cell of the same ring
  });

  it('answers nothing for a unit that is out of the fight', () => {
    const state = sniperAt({ x: 3, y: 3 });
    const fallen: UnitState = { ...unitAt(state, 'a1'), defeated: true };

    expect(attackArea(state, fallen.position, fallen)).toEqual([]);
  });
});
