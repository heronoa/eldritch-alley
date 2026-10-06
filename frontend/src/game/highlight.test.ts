import { describe, expect, it } from 'vitest';
import { reachableCells } from '../../../backend/engine/src/movement';
import { PROTOTYPE_MAPS, type PrototypeMap } from '../maps/prototype-maps';
import type { Board, PublicState, Team, UnitId, UnitState } from '../protocol';
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

  it('highlights only the enemies inside the reach', () => {
    const state = makeState([CORNER, NEAR, FAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'attack', humanTeam: 'A' });

    expect(cells).toEqual([{ x: 3, y: 0 }]);
  });

  it('does not paint an enemy behind a building', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 2, y: 0 }, range: 1 });
    const state = makeState([sniper, enemy], 0, makeBoard({ '1,0': 5 }));

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'attack', humanTeam: 'A' });

    expect(cells).toEqual([]);
  });

  it('paints the enemy across the rooftop gap', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 5, y: 2 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 2 }, range: 1 });
    const state = makeState([sniper, enemy], 0, makeBoard({ '5,2': 6, '6,2': 0, '7,2': 6 }));

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'attack', humanTeam: 'A' });

    expect(cells).toEqual([{ x: 7, y: 2 }]);
  });

  it('highlights exactly the cells a click would act on', () => {
    const state = makeState([CENTERED, NEAR, FAR]);

    for (const mode of ['move', 'attack'] as const) {
      const cells = highlightedCells({ state, selectedId: 'A-sniper', mode, humanTeam: 'A' });
      expect(cells.length).toBeGreaterThan(0);

      for (const cell of cells) {
        const intent = resolveClick({ state, selectedId: 'A-sniper', cell, humanTeam: 'A' });
        expect(intent.kind, `${mode} at ${cell.x},${cell.y}`).not.toBe('none');
        if (intent.kind === 'send') expect(intent.action.type).toBe(mode);
        // A move is armed by the first tap and sent by the second, so the first tap previews it.
        if (intent.kind === 'move-preview') expect(mode).toBe('move');
      }
    }
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
