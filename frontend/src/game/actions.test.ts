import { describe, expect, it } from 'vitest';
import type { Board, PublicState, Team, UnitId, UnitState } from '../protocol';
import type { Intent } from './selection';
import { actionButtons, applyMode, availableActions, settleMode, type AvailableActions } from './actions';

const BOARD: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };

interface UnitSpec {
  id: UnitId;
  team: Team;
  at?: { x: number; y: number };
  range?: number;
  magazine?: number | null;
  ammo?: number;
}

function makeUnit(spec: UnitSpec): UnitState {
  const magazine = spec.magazine === undefined ? 3 : spec.magazine;
  return {
    id: spec.id,
    team: spec.team,
    position: { ...(spec.at ?? { x: 0, y: 0 }) },
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
    defeated: false,
    ammo: spec.ammo ?? (magazine === null ? 0 : magazine),
    permanentlyDead: false,
    corpseExpiresAtRound: null,
  };
}

function makeState(
  units: readonly UnitState[],
  currentIndex = 0,
  overrides: Partial<PublicState> = {},
): PublicState {
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
    ...overrides,
  };
}

const SNIPER = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
const WIZARD = makeUnit({ id: 'A-wizard', team: 'A', at: { x: 1, y: 0 }, range: 1, magazine: null });
const ENEMY = makeUnit({ id: 'B-priest', team: 'B', at: { x: 3, y: 0 }, range: 1 });

describe('availableActions', () => {
  it('offers move, attack and the end of the turn on a fresh turn', () => {
    expect(availableActions(makeState([SNIPER, ENEMY]), 'A')).toEqual({
      canMove: true,
      canAttack: true,
      canReload: false,
      canEndTurn: true,
    });
  });

  it('offers a reload once a round has been spent', () => {
    const state = makeState([{ ...SNIPER, ammo: 2 }, ENEMY]);

    expect(availableActions(state, 'A').canReload).toBe(true);
  });

  it('never offers a reload to a class that carries no magazine', () => {
    const state = makeState([WIZARD, ENEMY]);

    expect(WIZARD.magazine).toBeNull();
    expect(availableActions(state, 'A').canReload).toBe(false);
  });

  it('leaves only the end of the turn once the action is spent', () => {
    const state = makeState([SNIPER, ENEMY], 0, { hasActed: true });

    expect(availableActions(state, 'A')).toEqual({
      canMove: false,
      canAttack: false,
      canReload: false,
      canEndTurn: true,
    });
  });

  it('refuses movement once the budget is spent', () => {
    const state = makeState([SNIPER, ENEMY], 0, { movementLeft: 0 });

    expect(availableActions(state, 'A').canMove).toBe(false);
  });

  it('refuses an attack when no enemy is inside the reach', () => {
    const far = makeUnit({ id: 'B-priest', team: 'B', at: { x: 4, y: 0 } });
    const state = makeState([SNIPER, far]);

    expect(SNIPER.range).toBe(3);
    expect(availableActions(state, 'A').canAttack).toBe(false);
  });

  it('refuses an attack when the other team has no unit left', () => {
    expect(availableActions(makeState([SNIPER]), 'A').canAttack).toBe(false);
  });

  it('refuses everything while the bot has the turn', () => {
    const state = makeState([SNIPER, ENEMY], 1);

    expect(availableActions(state, 'A')).toEqual({
      canMove: false,
      canAttack: false,
      canReload: false,
      canEndTurn: false,
    });
  });
});

describe('settleMode', () => {
  const ALL: AvailableActions = { canMove: true, canAttack: true, canReload: true, canEndTurn: true };
  const SPENT: AvailableActions = { canMove: false, canAttack: false, canReload: false, canEndTurn: true };

  it('leaves the inspection mode alone', () => {
    expect(settleMode('inspect', ALL)).toBe('inspect');
    expect(settleMode('inspect', SPENT)).toBe('inspect');
  });

  it('keeps an armed mode that is still available', () => {
    expect(settleMode('move', ALL)).toBe('move');
    expect(settleMode('attack', ALL)).toBe('attack');
  });

  it('drops the move mode once the movement is gone', () => {
    expect(settleMode('move', { ...ALL, canMove: false })).toBe('inspect');
  });

  it('drops the attack mode once the action is spent', () => {
    expect(settleMode('attack', { ...ALL, canAttack: false })).toBe('inspect');
  });
});

describe('applyMode', () => {
  const SELECT: Intent = { kind: 'select', unitId: 'A-sniper' };
  const MOVE: Intent = { kind: 'send', action: { type: 'move', to: { x: 1, y: 0 } } };
  const ATTACK: Intent = { kind: 'send', action: { type: 'attack', target: 'B-priest' } };
  const NOTHING: Intent = { kind: 'none' };

  it('hands every intent back untouched while nothing is armed', () => {
    for (const intent of [SELECT, MOVE, ATTACK, NOTHING]) {
      expect(applyMode('inspect', intent)).toEqual(intent);
    }
  });

  it('keeps a selection in every mode', () => {
    expect(applyMode('move', SELECT)).toEqual(SELECT);
    expect(applyMode('attack', SELECT)).toEqual(SELECT);
  });

  it('keeps only the move while the move mode is armed', () => {
    expect(applyMode('move', MOVE)).toEqual(MOVE);
    expect(applyMode('move', ATTACK)).toEqual({ kind: 'none' });
  });

  it('keeps only the attack while the attack mode is armed', () => {
    expect(applyMode('attack', ATTACK)).toEqual(ATTACK);
    expect(applyMode('attack', MOVE)).toEqual({ kind: 'none' });
  });

  it('never turns nothing into something', () => {
    expect(applyMode('move', NOTHING)).toEqual({ kind: 'none' });
    expect(applyMode('attack', NOTHING)).toEqual({ kind: 'none' });
  });
});

describe('actionButtons', () => {
  it('offers the four actions in order, in the player language', () => {
    const labels = actionButtons(makeState([SNIPER, ENEMY]), 'A').map((button) => button.label);

    expect(labels).toEqual(['Mover', 'Atacar', 'Recarregar', 'Terminar turno']);
  });

  it('arms the two board modes and sends the other two at once', () => {
    const modes = actionButtons(makeState([SNIPER, ENEMY]), 'A').map((button) => button.mode);

    expect(modes).toEqual(['move', 'attack', null, null]);
  });

  it('carries the availability of each action', () => {
    const enabled = actionButtons(makeState([SNIPER, ENEMY]), 'A').map((button) => button.enabled);

    expect(enabled).toEqual([true, true, false, true]);
  });

  it('disables every button while the bot has the turn', () => {
    const enabled = actionButtons(makeState([SNIPER, ENEMY], 1), 'A').map((button) => button.enabled);

    expect(enabled).toEqual([false, false, false, false]);
  });
});
