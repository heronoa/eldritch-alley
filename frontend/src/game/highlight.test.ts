import { describe, expect, it } from 'vitest';
import type { Board, PublicState, Team, UnitId, UnitState } from '../protocol';
import { highlightedCells } from './highlight';
import { resolveClick } from './selection';

const BOARD: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };

interface UnitSpec {
  id: UnitId;
  team: Team;
  at: { x: number; y: number };
  range?: number;
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
    movement: 3,
    nerve: 50,
    attunement: 50,
    primaryClass: 'sniper',
    equipment: { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null },
    abilities: { activeSets: [null, null], reaction: null, movement: null, support: null },
    defeated: false,
    ammo: 3,
    permanentlyDead: false,
    corpseExpiresAtRound: null,
  };
}

function makeState(units: readonly UnitState[], currentIndex = 0): PublicState {
  return {
    seed: 1,
    board: BOARD,
    units: [...units],
    initiative: units.map((unit) => unit.id),
    currentIndex,
    movementLeft: 3,
    round: 1,
    hasActed: false,
    eventCount: 0,
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

  it('highlights the eight cells around a unit standing in the open', () => {
    const state = makeState([CENTERED, NEAR, FAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'move', humanTeam: 'A' });

    expect(cells).toHaveLength(8);
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

  it('highlights only the enemies inside the reach', () => {
    const state = makeState([CORNER, NEAR, FAR]);

    const cells = highlightedCells({ state, selectedId: 'A-sniper', mode: 'attack', humanTeam: 'A' });

    expect(cells).toEqual([{ x: 3, y: 0 }]);
  });

  it('highlights exactly the cells that would send that action', () => {
    const state = makeState([CENTERED, NEAR, FAR]);

    for (const mode of ['move', 'attack'] as const) {
      const cells = highlightedCells({ state, selectedId: 'A-sniper', mode, humanTeam: 'A' });
      expect(cells.length).toBeGreaterThan(0);

      for (const cell of cells) {
        const intent = resolveClick({ state, selectedId: 'A-sniper', cell, humanTeam: 'A' });
        expect(intent.kind, `${mode} at ${cell.x},${cell.y}`).toBe('send');
        if (intent.kind === 'send') expect(intent.action.type).toBe(mode);
      }
    }
  });
});
