import { describe, expect, it } from 'vitest';
import type { BoardState, PublicState, Team, UnitId, UnitState } from '../protocol';
import type { Intent } from './selection';
import {
  actionButtons,
  applyMode,
  availableActions,
  moveChips,
  settleMode,
  type AvailableActions,
} from './actions';
import { setLocale } from '../i18n/translate';

// The cases below assert the Portuguese copy the game shipped with, so they read it on purpose.
setLocale('pt-BR');

const BOARD: BoardState = { width: 8, height: 8, levels: new Array<number>(64).fill(0), props: [] };

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
    movementProfile: { maxStepUp: 1, maxStepDown: 1, climbCost: 1 },
    facing: 'E',
    // The pool a basic attack spends, filled the way `newMatch` fills it: a magazine implies a kind.
    resourceKind: magazine === null ? null : 'ammo',
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
    pendingMove: null,
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
      nothingLeft: false,
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
      nothingLeft: true,
    });
  });

  it('refuses movement once the budget is spent', () => {
    const state = makeState([SNIPER, ENEMY], 0, { movementLeft: 0 });

    expect(availableActions(state, 'A').canMove).toBe(false);
  });

  it('refuses movement when no cell is reachable, however much budget is left', () => {
    // Buildings on the three neighbours of a unit in the corner: there is nowhere to step.
    const levels = new Array<number>(64).fill(0);
    levels[1] = 5; // (1,0)
    levels[8] = 5; // (0,1)
    levels[9] = 5; // (1,1)
    const state = makeState([SNIPER, ENEMY], 0, { board: { width: 8, height: 8, levels, props: [] } });

    expect(state.movementLeft).toBe(3);
    expect(availableActions(state, 'A').canMove).toBe(false);
  });

  it('offers the attack when cells are in reach, even with no enemy on them: the reach is shown first', () => {
    const far = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 7 } });
    const state = makeState([SNIPER, far]);

    expect(SNIPER.range).toBe(3);
    expect(availableActions(state, 'A').canAttack).toBe(true);
  });

  it('offers the attack to a unit whose own reach is zero, because the rule floors the reach at one', () => {
    // ADR 0015: shooting from below costs reach, so `effectiveRange` is floored at one and never
    // reaches zero. A `range` of 0 is therefore a reach of one, two adjacent cells are always in sight
    // of each other, and a live unit always has a cell to show. What takes the button away is having
    // acted, or having nobody left to shoot at — which the case below and the one after it cover.
    const state = makeState([{ ...SNIPER, range: 0 }, ENEMY]);

    expect(availableActions(state, 'A').canAttack).toBe(true);
  });

  it('refuses an attack when the unit has already acted', () => {
    const state = { ...makeState([SNIPER, ENEMY]), hasActed: true };

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
      nothingLeft: false,
    });
  });

  /**
   * `nothingLeft` is the question the automatic end of turn asks (EA-4). It is answered by the
   * engine, so the countdown fires exactly when the server would have nothing to accept.
   */
  describe('nothingLeft', () => {
    it('is true when no cell is reachable, no target is in reach and the magazine is full', () => {
      const far = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 7 } });
      const state = makeState([SNIPER, far], 0, { movementLeft: 0 });

      // The attack is offered to show its reach, but the turn has nothing left: nobody can be hit.
      expect(availableActions(state, 'A')).toMatchObject({
        canMove: false,
        canAttack: true,
        canReload: false,
        nothingLeft: true,
      });
    });

    it('is false while a reload is left, even with nowhere to walk and no target in reach', () => {
      const far = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 7 } });
      const state = makeState([{ ...SNIPER, ammo: 0 }, far], 0, { movementLeft: 0 });

      expect(availableActions(state, 'A')).toMatchObject({ canReload: true, nothingLeft: false });
    });

    it('is false while a target is in reach', () => {
      const state = makeState([SNIPER, ENEMY], 0, { movementLeft: 0 });

      expect(availableActions(state, 'A')).toMatchObject({ canAttack: true, nothingLeft: false });
    });

    it('is false on the bot turn, which must never start the countdown for the player', () => {
      // The bot itself has nothing left, and that is the bot's business, not the player's.
      const state = makeState([SNIPER, ENEMY], 1, { movementLeft: 0 });

      expect(state.initiative[state.currentIndex]).toBe(ENEMY.id);
      expect(availableActions(state, 'A').nothingLeft).toBe(false);
    });

    it('is false while a move waits to be confirmed, so the turn never passes with it open', () => {
      const far = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 7 } });
      // Everything else is spent: nowhere to walk, nobody in reach and a full magazine.
      const state = makeState([SNIPER, far], 0, {
        movementLeft: 0,
        pendingMove: { from: { x: 0, y: 0 }, cost: 3 },
      });

      expect(availableActions(state, 'A')).toMatchObject({
        canMove: false,
        canAttack: true,
        canReload: false,
        nothingLeft: false,
      });
    });
  });
});

describe('settleMode', () => {
  const ALL: AvailableActions = {
    canMove: true,
    canAttack: true,
    canReload: true,
    canEndTurn: true,
    nothingLeft: false,
  };
  const SPENT: AvailableActions = {
    canMove: false,
    canAttack: false,
    canReload: false,
    canEndTurn: true,
    nothingLeft: true,
  };

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

  it('sends nothing while nothing is armed: a click only selects or inspects', () => {
    expect(applyMode('inspect', SELECT)).toEqual(SELECT);
    expect(applyMode('inspect', MOVE)).toEqual({ kind: 'none' });
    expect(applyMode('inspect', ATTACK)).toEqual({ kind: 'none' });
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

/**
 * The two controls of a pending move (EA-5, D4 and D6). They exist only while a move waits to be
 * confirmed, and they carry no field at all: the engine reads the run out of its own state.
 */
describe('moveChips', () => {
  it('offers nothing while no move is waiting to be confirmed', () => {
    expect(moveChips(makeState([SNIPER, ENEMY]), 'A')).toEqual([]);
  });

  it('offers the confirmation and the cancel, in the player language, while a move waits', () => {
    const state = makeState([SNIPER, ENEMY], 0, { pendingMove: { from: { x: 0, y: 0 }, cost: 1 } });

    expect(moveChips(state, 'A')).toEqual([
      { id: 'confirmMove', label: 'Confirmar', action: { type: 'commitMove' } },
      { id: 'cancelMove', label: 'Cancelar', action: { type: 'cancelMove' } },
    ]);
  });

  it('offers nothing while the bot has the turn, which never cancels and never confirms', () => {
    const state = makeState([SNIPER, ENEMY], 1, { pendingMove: { from: { x: 3, y: 0 }, cost: 1 } });

    expect(moveChips(state, 'A')).toEqual([]);
  });
});
