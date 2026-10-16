import { describe, expect, it } from 'vitest';
import { applyAction, applyEvents, hashState, newMatch } from './match';
import { findPath, reachableCells } from './movement';
import type { Board, MatchSetup, MatchState, Position, Team, Unit } from './types';

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

function makeSetup(units: Unit[], heights: Record<string, number> = {}): MatchSetup {
  const team = (id: Team) => units.filter((unit) => unit.team === id);
  return { seed: 1, map: makeBoard(heights), teams: [team('A'), team('B')] };
}

/** A match with the hero at (0,0) on turn, whoever else the case needs, and one enemy out of the way. */
function state(
  hero: Partial<Unit> = {},
  others: readonly Unit[] = [],
  heights: Record<string, number> = {},
): MatchState {
  return newMatch(
    makeSetup(
      [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 10, ...hero }),
        ...others,
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
      ],
      heights,
    ),
  );
}

function unitAt(state: MatchState, id: string): Unit {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit with id ${id}`);
  return unit;
}

/** Cells as `x,y` strings, sorted, so two sets of cells can be compared whatever their order is. */
function keysOf(cells: readonly Position[]): string[] {
  return cells.map((cell) => `${cell.x},${cell.y}`).sort();
}

describe('reachableCells', () => {
  it('reaches every cell inside the budget on flat ground, and nothing past it', () => {
    const cells = keysOf(reachableCells(state({ movement: 2 }), 'a1'));

    // From the corner with 2 points: the 3x3 square around it, minus the cell it stands on.
    expect(cells).toEqual(['0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2']);
  });

  it('leaves out a building the profile cannot climb', () => {
    const cells = keysOf(reachableCells(state({ movement: 4 }, [], { '1,0': 5 }), 'a1'));

    expect(cells).not.toContain('1,0');
    // Going around it is allowed: the building is one cell, not a wall around the board.
    expect(cells).toContain('2,0');
  });

  it('has nothing for a unit that does not have the turn', () => {
    const idle = makeUnit({ id: 'a2', team: 'A', position: { x: 6, y: 0 }, speed: 1 });
    const match = state({}, [idle]);

    expect(reachableCells(match, 'b1')).toEqual([]);
    expect(reachableCells(match, 'a2')).toEqual([]);
  });

  it('passes through an ally but never ends on one', () => {
    // Buildings at (1,0) and (0,1) leave (1,1) as the only way out of the corner, and the ally holds it.
    const ally = makeUnit({ id: 'a2', team: 'A', position: { x: 1, y: 1 }, speed: 1 });
    const match = state({ movement: 4 }, [ally], { '1,0': 5, '0,1': 5 });

    const cells = keysOf(reachableCells(match, 'a1'));
    expect(cells).not.toContain('1,1');
    expect(cells).toContain('2,0');
    // The ally's cell is walked through, not skipped: both steps of the path are paid for.
    expect(findPath(match, 'a1', { x: 2, y: 0 })).toEqual({
      path: [
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
      cost: 2,
    });
  });

  it('is stopped by an enemy standing in the only way out', () => {
    const blocker = makeUnit({ id: 'b2', team: 'B', position: { x: 1, y: 1 }, speed: 1 });
    const match = state({ movement: 4 }, [blocker], { '1,0': 5, '0,1': 5 });

    expect(reachableCells(match, 'a1')).toEqual([]);
  });

  it('charges 2 for climbing a level, so 1 point left is not enough', () => {
    // The case measured in the playtest: the step onto the building edge is legal, but it costs the
    // whole climb, and the budget was one point.
    const board = { '1,0': 1 };

    expect(keysOf(reachableCells(state({ movement: 1 }, [], board), 'a1'))).not.toContain('1,0');
    expect(keysOf(reachableCells(state({ movement: 2 }, [], board), 'a1'))).toContain('1,0');
  });

  it('gives every reachable cell a path that fits in the movement left', () => {
    const match = state({ movement: 3 }, [], { '1,0': 5, '0,1': 1 });
    const cells = reachableCells(match, 'a1');

    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const path = findPath(match, 'a1', cell);
      expect(path, `no path to ${cell.x},${cell.y}`).not.toBeNull();
      expect(path?.cost).toBeLessThanOrEqual(match.movementLeft);
    }
  });
});

describe('findPath', () => {
  it('walks around a building rather than through it, at the cheapest cost', () => {
    const match = state({ movement: 4 }, [], { '1,0': 5 });

    expect(findPath(match, 'a1', { x: 2, y: 0 })).toEqual({
      path: [
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
      cost: 2,
    });
  });

  it('answers null when the destination costs more than the movement left', () => {
    const match = state({ movement: 1 }, [], { '1,0': 1 });

    expect(findPath(match, 'a1', { x: 1, y: 0 })).toBeNull();
  });

  it('gives the same state the same path when several routes cost the same', () => {
    const first = findPath(state({ movement: 4 }), 'a1', { x: 2, y: 2 });
    const second = findPath(state({ movement: 4 }), 'a1', { x: 2, y: 2 });

    // Two diagonals and a dogleg all cost 2; the fixed neighbour order picks the diagonal, always.
    expect(first).toEqual({
      path: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      cost: 2,
    });
    expect(second).toEqual(first);
  });

  it('opens a climb of two levels to a taller profile, at the cost that profile sets', () => {
    const board = { '1,0': 2 };
    const step = { x: 1, y: 0 };

    // The default profile stops at one level, which is the rule the game had before the profile.
    expect(findPath(state({ movement: 5 }, [], board), 'a1', step)).toBeNull();

    const climber = state(
      { movement: 5, movementProfile: { maxStepUp: 2, maxStepDown: 1, climbCost: 1 } },
      [],
      board,
    );
    expect(findPath(climber, 'a1', step)).toEqual({ path: [step], cost: 3 });

    const heavy = state(
      { movement: 5, movementProfile: { maxStepUp: 2, maxStepDown: 1, climbCost: 2 } },
      [],
      board,
    );
    expect(findPath(heavy, 'a1', step)).toEqual({ path: [step], cost: 5 });
  });
});

describe('movement and replay', () => {
  it('rebuilds the same match from the moved event that carries the path', () => {
    const setup = makeSetup(
      [
        makeUnit({ id: 'a1', team: 'A', position: { x: 0, y: 0 }, speed: 10, movement: 4 }),
        makeUnit({ id: 'b1', team: 'B', position: { x: 7, y: 7 }, speed: 1 }),
      ],
      { '1,0': 5 },
    );

    const result = applyAction(newMatch(setup), { type: 'move', actor: 'a1', to: { x: 2, y: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.events).toEqual([
      {
        type: 'moved',
        actor: 'a1',
        from: { x: 0, y: 0 },
        to: { x: 2, y: 0 },
        path: [
          { x: 1, y: 1 },
          { x: 2, y: 0 },
        ],
      },
    ]);
    expect(unitAt(result.state, 'a1').position).toEqual({ x: 2, y: 0 });
    expect(result.state.movementLeft).toBe(2);
    expect(hashState(applyEvents(setup, result.events))).toBe(hashState(result.state));
  });
});
