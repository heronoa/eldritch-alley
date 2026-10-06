import { describe, expect, it } from 'vitest';
import type { Board, PublicState, Team, UnitState } from '../protocol';
import { confirmMove, resolveClick, type Intent } from './selection';

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
  id: string;
  team: Team;
  at: { x: number; y: number };
  range?: number;
  magazine?: number | null;
  ammo?: number;
  defeated?: boolean;
  permanentlyDead?: boolean;
}

function makeUnit(spec: UnitSpec): UnitState {
  const magazine = spec.magazine === undefined ? 3 : spec.magazine;
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
    magazine,
    movement: 3,
    nerve: 50,
    attunement: 50,
    primaryClass: 'sniper',
    equipment: { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null },
    abilities: { activeSets: [null, null], reaction: null, movement: null, support: null },
    movementProfile: { maxStepUp: 1, maxStepDown: 1, climbCost: 1 },
    defeated: spec.defeated ?? false,
    ammo: spec.ammo ?? (magazine === null ? 0 : magazine),
    permanentlyDead: spec.permanentlyDead ?? false,
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

describe('resolveClick', () => {
  it('selects a living unit of the human team', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const state = makeState([sniper]);

    const intent = resolveClick({ state, selectedId: null, cell: { x: 0, y: 0 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'select', unitId: 'A-sniper' });
  });

  it('returns none for a click on an enemy with nothing selected', () => {
    const enemy = makeUnit({ id: 'B-sniper', team: 'B', at: { x: 3, y: 0 } });
    const state = makeState([enemy]);

    const intent = resolveClick({ state, selectedId: null, cell: { x: 3, y: 0 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'none' });
  });

  it('sends an attack on an enemy inside the selected range', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 3, y: 0 }, range: 1 });
    const state = makeState([sniper, enemy]);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 3, y: 0 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'send', action: { type: 'attack', target: 'B-priest' } });
  });

  it('returns none for an enemy behind a building, inside the range', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 2, y: 0 }, range: 1 });
    const state = makeState([sniper, enemy], 0, makeBoard({ '1,0': 5 }));

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 2, y: 0 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'none' });
  });

  it('sends an attack across the rooftop gap', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 5, y: 2 }, range: 3, magazine: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 2 }, range: 1 });
    const state = makeState([sniper, enemy], 0, makeBoard({ '5,2': 6, '6,2': 0, '7,2': 6 }));

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 7, y: 2 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'send', action: { type: 'attack', target: 'B-priest' } });
  });

  it('returns none for an enemy outside the selected range', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 4, y: 0 }, range: 1 });
    const state = makeState([sniper, enemy]);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 4, y: 0 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'none' });
  });

  it('treats the attack of an empty magazine as melee', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3, magazine: 3, ammo: 0 });
    const adjacent = makeUnit({ id: 'B-priest', team: 'B', at: { x: 1, y: 0 }, range: 1 });
    const twoAway = makeUnit({ id: 'B-wizard', team: 'B', at: { x: 2, y: 0 }, range: 1 });
    const state = makeState([sniper, adjacent, twoAway]);

    expect(resolveClick({ state, selectedId: 'A-sniper', cell: { x: 2, y: 0 }, humanTeam: 'A' })).toEqual({
      kind: 'none',
    });
    expect(resolveClick({ state, selectedId: 'A-sniper', cell: { x: 1, y: 0 }, humanTeam: 'A' })).toEqual({
      kind: 'send',
      action: { type: 'attack', target: 'B-priest' },
    });
  });

  it('previews the path on the first tap, and moves nobody', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const state = makeState([sniper]);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 0, y: 2 }, humanTeam: 'A' });

    expect(intent).toEqual({
      kind: 'move-preview',
      to: { x: 0, y: 2 },
      path: [
        { x: 0, y: 1 },
        { x: 0, y: 2 },
      ],
      cost: 2,
    });
  });

  it('previews the neighbour too, so a single tap never moves a unit', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const state = makeState([sniper]);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 1, y: 1 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'move-preview', to: { x: 1, y: 1 }, path: [{ x: 1, y: 1 }], cost: 1 });
  });

  it('returns none for a cell past the movement budget', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const state = makeState([sniper]);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 0, y: 4 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'none' });
  });

  it('returns none for a destination with no way out of the corner', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const state = makeState([sniper], 0, makeBoard({ '1,0': 5, '0,1': 5, '1,1': 5 }));

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 2, y: 0 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'none' });
  });

  it('returns none for a move once the movement budget is spent', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const state = makeState([sniper], 0, BOARD, 0);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 1, y: 0 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'none' });
  });

  it('returns none for a send when the selected unit is not the current unit', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
    const wizard = makeUnit({ id: 'A-wizard', team: 'A', at: { x: 2, y: 0 }, range: 1 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 3, y: 0 }, range: 1 });
    // The wizard is on turn, the sniper is the one selected.
    const state = makeState([sniper, wizard, enemy], 1);

    expect(resolveClick({ state, selectedId: 'A-sniper', cell: { x: 3, y: 0 }, humanTeam: 'A' })).toEqual({
      kind: 'none',
    });
    expect(resolveClick({ state, selectedId: 'A-sniper', cell: { x: 1, y: 0 }, humanTeam: 'A' })).toEqual({
      kind: 'none',
    });
  });

  it('previews the move onto the tile of a body that was removed for good', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const removed = makeUnit({ id: 'B-priest', team: 'B', at: { x: 1, y: 0 }, defeated: true, permanentlyDead: true });
    const state = makeState([sniper, removed]);

    expect(resolveClick({ state, selectedId: 'A-sniper', cell: { x: 1, y: 0 }, humanTeam: 'A' })).toEqual({
      kind: 'move-preview',
      to: { x: 1, y: 0 },
      path: [{ x: 1, y: 0 }],
      cost: 1,
    });
  });

  it('keeps a fallen body that is not removed yet as an occupant of its tile', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const body = makeUnit({ id: 'B-priest', team: 'B', at: { x: 1, y: 0 }, defeated: true, permanentlyDead: false });
    const state = makeState([sniper, body]);

    expect(resolveClick({ state, selectedId: 'A-sniper', cell: { x: 1, y: 0 }, humanTeam: 'A' })).toEqual({
      kind: 'none',
    });
  });
});

describe('confirmMove', () => {
  const SNIPER = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
  const STATE = makeState([SNIPER]);

  function tap(cell: { x: number; y: number }): Intent {
    return resolveClick({ state: STATE, selectedId: 'A-sniper', cell, humanTeam: 'A' });
  }

  it('sends the move when the second tap lands on the armed cell', () => {
    const intent = confirmMove({ x: 0, y: 2 }, tap({ x: 0, y: 2 }));

    expect(intent).toEqual({ kind: 'send', action: { type: 'move', to: { x: 0, y: 2 } } });
  });

  it('arms the new cell when the second tap lands somewhere else', () => {
    const intent = confirmMove({ x: 0, y: 1 }, tap({ x: 0, y: 2 }));

    expect(intent).toMatchObject({ kind: 'move-preview', to: { x: 0, y: 2 } });
  });

  it('never sends a move that no first tap armed', () => {
    const intent = confirmMove(null, tap({ x: 0, y: 2 }));

    expect(intent).toMatchObject({ kind: 'move-preview', to: { x: 0, y: 2 } });
  });

  it('leaves every other intent as it was', () => {
    const armed = { x: 0, y: 1 };
    const attack: Intent = { kind: 'send', action: { type: 'attack', target: 'B-priest' } };
    const select: Intent = { kind: 'select', unitId: 'A-sniper' };

    expect(confirmMove(armed, attack)).toEqual(attack);
    expect(confirmMove(armed, select)).toEqual(select);
    expect(confirmMove(armed, { kind: 'none' })).toEqual({ kind: 'none' });
  });
});
