import { describe, expect, it } from 'vitest';
import { attackArea, reachableCells } from '@eldritch-alley/engine';
import { PROTOTYPE_MAPS, type PrototypeMap } from '../maps/prototype-maps';
import type { Board, PublicState, Team, UnitId, UnitState } from '../protocol';
import type { ActionMode } from './actions';
import { highlightedCells } from './highlight';
import { resolveClick } from './selection';

const BOARD: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };

/** A flat board with the given cells raised, keyed by `x,y`. */
function makeBoard(heights: Record<string, number>): Board {
  const levels = new Array<number>(64).fill(0);
  for (const [key, level] of Object.entries(heights)) {
    const [x, y] = key.split(',').map(Number);
    levels[y * 8 + x] = level;
  }
  return { width: 8, height: 8, levels };
}

interface UnitSpec {
  id: UnitId;
  team: Team;
  at: { x: number; y: number };
  range?: number;
  movement?: number;
}

function makeUnit(spec: UnitSpec): UnitState {
  return {
    id: spec.id,
    team: spec.team,
    position: { ...spec.at },
    speed: 10,
    health: 12,
    maxHealth: 12,
    attack: 4,
    hitChance: 80,
    range: spec.range ?? 3,
    magazine: 3,
    movement: spec.movement ?? 3,
    nerve: 50,
    attunement: 50,
    primaryClass: 'sniper',
    equipment: { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null },
    abilities: { activeSets: [null, null], reaction: null, movement: null, support: null },
    movementProfile: { maxStepUp: 1, maxStepDown: 1, climbCost: 1 },
    defeated: false,
    ammo: 3,
    permanentlyDead: false,
    corpseExpiresAtRound: null,
  };
}

function makeState(
  units: readonly UnitState[],
  currentIndex = 0,
  board: Board = BOARD,
  movementLeft = 3,
  pendingMove: PublicState['pendingMove'] = null,
): PublicState {
  return {
    seed: 1,
    board,
    units: [...units],
    initiative: units.map((unit) => unit.id),
    currentIndex,
    movementLeft,
    round: 1,
    hasActed: false,
    eventCount: 0,
    pendingMove,
  };
}

/** Cells as `x,y` strings, sorted, so the client's cells and the engine's can be compared as sets. */
function keys(cells: readonly { x: number; y: number }[]): string[] {
  return cells.map((cell) => `${cell.x},${cell.y}`).sort();
}

/** The board of a prototype map, built the way the server builds it: a gap in the ground is floor. */
function boardOf(map: PrototypeMap): Board {
  return {
    width: map.tiles[0].length,
    height: map.tiles.length,
    levels: map.heights.flatMap((row) => row.map((height) => (height === map.void ? 0 : height))),
  };
}

/** In the corner, so the board edge is part of what is being checked. */
const CORNER = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
/** In the open, where every neighbour is a legal cell. */
const CENTERED = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 3, y: 3 }, range: 3 });
const NEAR = makeUnit({ id: 'B-priest', team: 'B', at: { x: 3, y: 0 }, range: 1 });
const FAR = makeUnit({ id: 'B-wizard', team: 'B', at: { x: 7, y: 7 }, range: 1 });

describe('highlightedCells', () => {
  it('answers the same question for the same state from memory, and a new state afresh', () => {
    const state = makeState([CORNER, NEAR]);
    const ask = { state, selectedId: 'A-sniper', mode: 'move' as const, humanTeam: 'A' as const };

    const first = highlightedCells(ask);
    expect(highlightedCells(ask)).toBe(first);

    // A new state object is a new question: the answer is worked out again, and it is the same.
    const again = highlightedCells({ ...ask, state: { ...state } });
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });

  it('highlights nothing while nothing is armed', () => {
    const state = makeState([CORNER, NEAR]);

    expect(highlightedCells({ state, selectedId: 'A-sniper', mode: 'inspect', humanTeam: 'A' })).toEqual([]);
  });

  it('highlights nothing while the bot has the turn', () => {
    const state = makeState([CORNER, NEAR], 1);

    expect(highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' })).toEqual([]);
  });

  it('highlights nothing when no unit is selected', () => {
    const state = makeState([CORNER, NEAR]);

    expect(highlightedCells({ state, selectedId: null, mode: 'move', humanTeam: 'A' })).toEqual([]);
  });

  it('paints the square the movement budget reaches, and not one cell more', () => {
    const state = makeState([CORNER, FAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' });

    // From the corner with 3 points: the 4x4 square around it, minus the cell it stands on.
    expect(cells).toHaveLength(15);
    expect(cells).toContainEqual({ x: 3, y: 3 });
    expect(cells).not.toContainEqual({ x: 4, y: 0 });
    expect(cells).not.toContainEqual({ x: 0, y: 0 });
  });

  it('paints a cell several steps away, not only the neighbours', () => {
    const state = makeState([CENTERED, NEAR, FAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' });

    expect(cells).toContainEqual({ x: 0, y: 3 });
    expect(cells).toContainEqual({ x: 3, y: 6 });
  });

  it('highlights only the cells of the board', () => {
    const state = makeState([CORNER, NEAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' });

    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(8);
      expect(cell.y).toBeLessThan(8);
    }
  });

  it('leaves out a cell another unit is standing on', () => {
    const neighbour = makeUnit({ id: 'A-wizard', team: 'A', at: { x: 1, y: 0 }, range: 1 });
    const state = makeState([CORNER, neighbour, NEAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' });

    expect(cells).not.toContainEqual({ x: 1, y: 0 });
  });

  it('leaves out a building the unit cannot climb', () => {
    const state = makeState([CORNER, FAR], 0, makeBoard({ '1,0': 5 }));

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' });

    expect(cells).not.toContainEqual({ x: 1, y: 0 });
    // The building is one cell, not a wall: the cells around it are still reachable.
    expect(cells).toContainEqual({ x: 2, y: 0 });
  });

  it('leaves out a climb the budget cannot pay for, and paints it when the budget can', () => {
    // The case measured in the playtest: a step onto a cell one level up costs 2 points.
    const board = makeBoard({ '1,0': 1 });

    const poor = makeState([CORNER, FAR], 0, board, 1);
    expect(
      highlightedCells({ state: poor, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' }),
    ).not.toContainEqual({ x: 1, y: 0 });

    const rich = makeState([CORNER, FAR], 0, board, 2);
    expect(
      highlightedCells({ state: rich, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' }),
    ).toContainEqual({ x: 1, y: 0 });
  });

  it('paints the whole area the shot covers from where the unit stands', () => {
    const state = makeState([CORNER, NEAR, FAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'attack', humanTeam: 'A' });

    // The area of a reach of 3 from the corner: the cell it stands on left out, the enemy cell in.
    expect(keys(cells)).toEqual(keys(attackArea(state, { x: 0, y: 0 }, CORNER)));
    expect(cells).toContainEqual({ x: 3, y: 0 });
    expect(cells).toContainEqual({ x: 2, y: 2 });
    expect(cells).not.toContainEqual({ x: 0, y: 0 });
  });

  it('does not paint a cell a building takes out of the line', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 2, y: 0 }, range: 1 });
    const state = makeState([sniper, enemy], 0, makeBoard({ '1,0': 5 }));

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'attack', humanTeam: 'A' });

    expect(cells).not.toContainEqual({ x: 2, y: 0 });
    // The building itself is in the area: it is one cell, not a wall across the board.
    expect(cells).toContainEqual({ x: 1, y: 0 });
  });

  it('paints the enemy across the rooftop gap', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 5, y: 2 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 2 }, range: 1 });
    const state = makeState([sniper, enemy], 0, makeBoard({ '5,2': 6, '6,2': 0, '7,2': 6 }));

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'attack', humanTeam: 'A' });

    expect(cells).toContainEqual({ x: 7, y: 2 });
  });

  it('highlights exactly the cells a click would act on while a destination is being chosen', () => {
    const state = makeState([CENTERED, NEAR, FAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' });
    expect(cells.length).toBeGreaterThan(0);

    for (const cell of cells) {
      // A move is armed by the first tap and sent by the second, so the first tap previews it.
      const intent = resolveClick({ state, selectedId: 'A-sniper', cell, humanTeam: 'A' });
      expect(intent.kind, `move at ${cell.x},${cell.y}`).toBe('move-preview');
    }
  });

  it('paints the area of the attack, where only an occupied cell is a target to click', () => {
    const state = makeState([CENTERED, NEAR, FAR]);
    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'attack', humanTeam: 'A' });

    for (const cell of cells) {
      // The enemy in reach is the cell a click sends from; an empty cell of the area is a position,
      // not a target yet (EA-8 decides what a click on it means).
      const occupied = cell.x === NEAR.position.x && cell.y === NEAR.position.y;
      const intent = resolveClick({ state, selectedId: 'A-sniper', cell, humanTeam: 'A' });
      expect(intent.kind === 'send', `attack at ${cell.x},${cell.y}`).toBe(occupied);
    }
  });
});

/**
 * One area at a time: the board paints the area of the question the turn is asking, and never two
 * (EA-5, D1). While a destination is being chosen that is where the unit can walk; while a move
 * waits to be confirmed, and while the attack is armed, that is what it can hit from where it stands.
 */
describe('the one area of the state', () => {
  /** In the open, with a reach of one and a budget of three: the two rules answer differently. */
  const SNIPER = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 3, y: 3 }, range: 1, movement: 3 });
  /** The same unit after a step to the left: the run started on (3,3) and has cost one point. */
  const MOVED = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 2, y: 3 }, range: 1, movement: 3 });
  const ENEMY = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 7 }, range: 1 });
  const RUN = { from: { x: 3, y: 3 }, cost: 1 };

  function choosing(): PublicState {
    return makeState([SNIPER, ENEMY], 0, BOARD, 3);
  }

  function pending(): PublicState {
    return makeState([MOVED, ENEMY], 0, BOARD, 2, RUN);
  }

  function painted(state: PublicState, mode: ActionMode): string[] {
    return keys(highlightedCells({ state, selectedId: 'A-sniper', mode, humanTeam: 'A' }));
  }

  it('paints the cells a destination may be chosen from, and not the area of the attack', () => {
    const state = choosing();

    const cells = painted(state, 'move');

    expect(cells).toEqual(keys(reachableCells(state, 'A-sniper')));
    expect(cells).not.toEqual(keys(attackArea(state, SNIPER.position, SNIPER)));
    // Three steps away is reachable and out of a reach of one: the two rules are not the same set.
    expect(cells).toContain('3,6');
  });

  it('paints the area the unit can hit from where it stands once a move is pending', () => {
    const state = pending();

    const cells = painted(state, 'inspect');

    expect(cells).toEqual(keys(attackArea(state, MOVED.position, MOVED)));
    expect(cells).toHaveLength(8); // a reach of one, in the open
    expect(cells).not.toEqual(keys(reachableCells(state, 'A-sniper')));
  });

  it('keeps painting the destinations when the move is armed again, so a run may go on', () => {
    const state = pending();

    expect(painted(state, 'move')).toEqual(keys(reachableCells(state, 'A-sniper')));
  });

  it('never mixes the two rules in one answer', () => {
    const cases: { state: PublicState; unit: UnitState; mode: ActionMode }[] = [
      { state: choosing(), unit: SNIPER, mode: 'move' },
      { state: choosing(), unit: SNIPER, mode: 'attack' },
      { state: pending(), unit: MOVED, mode: 'inspect' },
      { state: pending(), unit: MOVED, mode: 'attack' },
      { state: pending(), unit: MOVED, mode: 'move' },
    ];

    for (const { state, unit, mode } of cases) {
      const reach = keys(reachableCells(state, 'A-sniper'));
      const area = keys(attackArea(state, unit.position, unit));

      expect(reach, `${mode}: the two rules answer differently`).not.toEqual(area);
      // The answer is one of the two, whole: never the two of them added up.
      expect([reach, area], `${mode}`).toContainEqual(painted(state, mode));
    }
  });

  it('paints nothing for a unit that does not have the turn, in the attack as in the move', () => {
    // The bot is on turn and the human's sniper is selected: the board asks nothing of the player.
    const state = makeState([SNIPER, ENEMY], 1);

    expect(painted(state, 'move')).toEqual([]);
    expect(painted(state, 'attack')).toEqual([]);
  });
});

describe('the client and the engine agree on what a move reaches', () => {
  /** The street squad, on its own spawns and with the budgets the server gives it. */
  const SQUAD = [
    { at: { x: 4, y: 9 }, movement: 3 },
    { at: { x: 3, y: 9 }, movement: 4 },
    { at: { x: 5, y: 9 }, movement: 4 },
  ];

  function street(): Board {
    return boardOf(PROTOTYPE_MAPS.find((map) => map.id === 'street')!);
  }

  it('paints the cells the engine calls reachable, for each unit of the street squad', () => {
    const board = street();

    for (const member of SQUAD) {
      const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: member.at, movement: member.movement });
      const state = makeState([sniper], 0, board, member.movement);

      const painted = keys(highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' }));
      expect(painted.length, `at ${member.at.x},${member.at.y}`).toBeGreaterThan(0);
      expect(painted, `at ${member.at.x},${member.at.y}`).toEqual(keys(reachableCells(state, 'A-sniper')));
    }
  });

  it('agrees when the squad stands in each other way', () => {
    const units = SQUAD.map((member, index) =>
      makeUnit({ id: `A-${index}`, team: 'A', at: member.at, movement: member.movement }),
    );
    const state = makeState(units, 0, street(), 3);

    const painted = keys(highlightedCells({ state, selectedId: 'A-0', mode: 'move', humanTeam: 'A' }));

    expect(painted).toEqual(keys(reachableCells(state, 'A-0')));
  });

  it('agrees on the three maps, at the spawn of the first unit', () => {
    for (const map of PROTOTYPE_MAPS) {
      const unit = makeUnit({ id: 'A-sniper', team: 'A', at: map.spawns.A[0], movement: 3 });
      const state = makeState([unit], 0, boardOf(map), 3);

      const painted = keys(highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' }));

      expect(painted, map.id).toEqual(keys(reachableCells(state, 'A-sniper')));
    }
  });
});
