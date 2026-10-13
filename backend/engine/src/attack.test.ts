import { describe, expect, it } from 'vitest';
import { validateAction } from './actions';
import { attackArea } from './attack';
import { newMatch } from './match';
import { heightBonus } from './height';
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

describe('attackArea and the reach of a shot', () => {
  /** The platform the sniper stands on, and the reach every case here starts from. */
  const PLATFORM: Position = { x: 3, y: 3 };
  const RANGE = 3;

  /** The board the reach is read on: the platform raised, everything else on the ground, no props. */
  function plateau(levels: number): Record<string, number> {
    return levels === 0 ? {} : { [`${PLATFORM.x},${PLATFORM.y}`]: levels };
  }

  function matchOn(heights: Record<string, number>, enemyAt: Position = { x: 7, y: 7 }): MatchState {
    return newMatch(
      makeSetup(
        [
          makeUnit({ id: 'a1', team: 'A', position: PLATFORM, speed: 10, range: RANGE, magazine: 3 }),
          makeUnit({ id: 'b1', team: 'B', position: enemyAt, speed: 1 }),
        ],
        heights,
      ),
    );
  }

  /** The area the engine paints from the platform. */
  function painted(heights: Record<string, number>): string[] {
    const state = matchOn(heights);
    const sniper = unitAt(state, 'a1');

    return keys(attackArea(state, sniper.position, sniper));
  }

  /**
   * The cells the server accepts, read one cell at a time: the enemy is put on each cell of the board
   * in turn and the refusal itself is asked. It is the long way round on purpose — it is the answer
   * the player gets on the click, and the one the highlight has to agree with.
   */
  function accepted(heights: Record<string, number>): string[] {
    const cells: string[] = [];

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        // The cell the sniper stands on is not a target at all, and two units cannot share it.
        if (x === PLATFORM.x && y === PLATFORM.y) continue;

        const state = matchOn(heights, { x, y });
        if (validateAction(state, { type: 'attack', actor: 'a1', target: 'b1' }) === null) {
          cells.push(`${x},${y}`);
        }
      }
    }

    return cells.sort();
  }

  it('paints exactly the cells the server accepts, at every height difference', () => {
    for (const levels of [0, 1, 2, 3]) {
      const heights = plateau(levels);

      expect(painted(heights), `${levels} levels up`).toEqual(accepted(heights));
    }
  });

  it('widens the painted area by the reach of the table, two levels up', () => {
    expect(heightBonus(2).range).toBeGreaterThan(0);

    const level = painted(plateau(0));
    const above = painted(plateau(2));

    expect(above.length).toBeGreaterThan(level.length);
    expect(above).toEqual(expect.arrayContaining(level));
  });
});
