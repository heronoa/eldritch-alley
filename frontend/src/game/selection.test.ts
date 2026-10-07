import { describe, expect, it } from 'vitest';
import type { Board, PublicState, Team, UnitState } from '../protocol';
import { applyMode } from './actions';
import { resolveClick, resolveInspect } from './selection';

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
  resourceKind?: 'ammo' | 'mana';
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
    // Filled the way `newMatch` fills it: a pool that exists is always of one kind.
    resourceKind: magazine === null ? null : (spec.resourceKind ?? 'ammo'),
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
    pendingMove: null,
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

  it('refuses an enemy behind a building with the reason of the engine', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 2, y: 0 }, range: 1 });
    const state = makeState([sniper, enemy], 0, makeBoard({ '1,0': 5 }));

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 2, y: 0 }, humanTeam: 'A' });

    // Nothing is sent: the click is turned down, and the reason is what the player is told (EA-8).
    expect(intent).toEqual({ kind: 'refused', reason: 'no-line-of-sight' });
    expect(intent).not.toHaveProperty('action');
  });

  it('sends an attack across the rooftop gap', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 5, y: 2 }, range: 3, magazine: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 7, y: 2 }, range: 1 });
    const state = makeState([sniper, enemy], 0, makeBoard({ '5,2': 6, '6,2': 0, '7,2': 6 }));

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 7, y: 2 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'send', action: { type: 'attack', target: 'B-priest' } });
  });

  it('refuses an enemy outside the selected range with the reason of the engine', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 4, y: 0 }, range: 1 });
    const state = makeState([sniper, enemy]);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 4, y: 0 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'refused', reason: 'target-out-of-range' });
    expect(intent).not.toHaveProperty('action');
  });

  it('refuses an attack nobody can pay for, at any distance, with the reason of the engine', () => {
    // The empty pool is answered before the reach is read, as `validateAttack` answers it (ADR 0011),
    // and the reach is the unit's `range`: an empty magazine no longer turns the shot into melee.
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3, magazine: 3, ammo: 0 });
    const adjacent = makeUnit({ id: 'B-priest', team: 'B', at: { x: 1, y: 0 }, range: 1 });
    const twoAway = makeUnit({ id: 'B-wizard', team: 'B', at: { x: 2, y: 0 }, range: 1 });
    const beyondReach = makeUnit({ id: 'B-sniper', team: 'B', at: { x: 4, y: 0 }, range: 1 });
    const state = makeState([sniper, adjacent, twoAway, beyondReach]);

    for (const cell of [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }]) {
      const intent = resolveClick({ state, selectedId: 'A-sniper', cell, humanTeam: 'A' });

      expect(intent).toEqual({ kind: 'refused', reason: 'no-ammunition' });
      expect(intent).not.toHaveProperty('action');
    }
  });

  it('names the empty pool of a magic class no-mana, and sends the spell with mana left', () => {
    const wizard = makeUnit({
      id: 'A-wizard',
      team: 'A',
      at: { x: 0, y: 0 },
      range: 3,
      magazine: 3,
      ammo: 0,
      resourceKind: 'mana',
    });
    const enemy = makeUnit({ id: 'B-priest', team: 'B', at: { x: 3, y: 0 }, range: 1 });
    const empty = makeState([wizard, enemy]);
    const full = makeState([{ ...wizard, ammo: 3 }, enemy]);

    expect(resolveClick({ state: empty, selectedId: 'A-wizard', cell: { x: 3, y: 0 }, humanTeam: 'A' })).toEqual({
      kind: 'refused',
      reason: 'no-mana',
    });
    expect(resolveClick({ state: full, selectedId: 'A-wizard', cell: { x: 3, y: 0 }, humanTeam: 'A' })).toEqual({
      kind: 'send',
      action: { type: 'attack', target: 'B-priest' },
    });
  });

  it('sends the move to a reachable cell: the destination is the move, and it stays pending', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const state = makeState([sniper]);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 0, y: 2 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'send', action: { type: 'move', to: { x: 0, y: 2 } } });
  });

  it('sends a move to the neighbour as well, one click for each destination', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 } });
    const state = makeState([sniper]);

    const intent = resolveClick({ state, selectedId: 'A-sniper', cell: { x: 1, y: 1 }, humanTeam: 'A' });

    expect(intent).toEqual({ kind: 'send', action: { type: 'move', to: { x: 1, y: 1 } } });
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
      kind: 'send',
      action: { type: 'move', to: { x: 1, y: 0 } },
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

/**
 * EA-8: the press lands on the sprite of a unit, which stands over the cell above the one its feet
 * rest on. The target is the unit the player sees, not the cell the finger happens to cover, and the
 * rules applied to it are the ones the cell path already applies — team, defeat, reach and sight.
 */
describe('resolveClick on a unit', () => {
  /** The sniper on its own turn, and the enemy three cells away: in reach, and in sight. */
  const SNIPER = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 3 }, range: 3 });
  const ENEMY = makeUnit({ id: 'B-priest', team: 'B', at: { x: 3, y: 3 }, range: 1 });
  /** The cell the body of the enemy covers, which is not the one it stands on. */
  const OVER_THE_BODY = { x: 3, y: 2 };

  it('sends the attack of the armed mode when the press lands on the enemy sprite', () => {
    const state = makeState([SNIPER, ENEMY]);

    const intent = resolveClick({
      state,
      selectedId: 'A-sniper',
      cell: OVER_THE_BODY,
      targetId: 'B-priest',
      humanTeam: 'A',
    });

    expect(applyMode('attack', intent)).toEqual({ kind: 'send', action: { type: 'attack', target: 'B-priest' } });
  });

  it('refuses a target out of reach, and sends nothing', () => {
    const far = makeUnit({ id: 'B-wizard', team: 'B', at: { x: 7, y: 3 }, range: 1 });
    const state = makeState([SNIPER, far]);

    const intent = applyMode('attack', resolveClick({
      state,
      selectedId: 'A-sniper',
      cell: { x: 7, y: 2 },
      targetId: 'B-wizard',
      humanTeam: 'A',
    }));

    expect(intent).toEqual({ kind: 'refused', reason: 'target-out-of-range' });
    expect(intent).not.toHaveProperty('action');
  });

  it('refuses a target behind a building, and sends nothing', () => {
    const state = makeState([SNIPER, ENEMY], 0, makeBoard({ '1,3': 6, '2,3': 6 }));

    const intent = applyMode('attack', resolveClick({
      state,
      selectedId: 'A-sniper',
      cell: OVER_THE_BODY,
      targetId: 'B-priest',
      humanTeam: 'A',
    }));

    expect(intent).toEqual({ kind: 'refused', reason: 'no-line-of-sight' });
    expect(intent).not.toHaveProperty('action');
  });

  it('selects the ally whose sprite was pressed', () => {
    const wizard = makeUnit({ id: 'A-wizard', team: 'A', at: { x: 2, y: 3 }, range: 1 });
    const state = makeState([SNIPER, wizard]);

    const intent = resolveClick({
      state,
      selectedId: 'A-sniper',
      cell: { x: 2, y: 2 },
      targetId: 'A-wizard',
      humanTeam: 'A',
    });

    expect(intent).toEqual({ kind: 'select', unitId: 'A-wizard' });
  });

  it('resolves a press on a portrait of the turn queue as a press on the same unit', () => {
    const state = makeState([SNIPER, ENEMY]);

    // The carousel draws one slot per unit of the queue, in turn order (`turnOrder`), and the scene
    // reads a press on a slot as the unit it shows: the two presses name the same unit and are given
    // the same cell, so a portrait and a sprite of one unit can never answer differently (EA-8).
    const portrait = resolveClick({
      state,
      selectedId: 'A-sniper',
      cell: ENEMY.position,
      targetId: 'B-priest',
      humanTeam: 'A',
    });
    const sprite = resolveClick({
      state,
      selectedId: 'A-sniper',
      cell: OVER_THE_BODY,
      targetId: 'B-priest',
      humanTeam: 'A',
    });

    expect(portrait).toEqual({ kind: 'send', action: { type: 'attack', target: 'B-priest' } });
    expect(sprite).toEqual(portrait);
  });
});

/**
 * The secondary gesture: the right button on desktop, a long press on a finger (EA-6, D4). It names
 * the unit it asks about and carries no action at all, so nothing it produces can be sent.
 */
describe('resolveInspect', () => {
  /** The human's sniper on its own turn, and the enemy the gesture asks about. */
  const SNIPER = makeUnit({ id: 'A-sniper', team: 'A', at: { x: 0, y: 0 }, range: 3 });
  const ENEMY = makeUnit({ id: 'B-priest', team: 'B', at: { x: 3, y: 0 }, range: 2 });
  const ENEMY_CELL = { x: 3, y: 0 };

  /** The states of the turn the gesture has to answer the same in, a move pending and the bot included. */
  const states: { what: string; state: PublicState }[] = [
    { what: 'idle', state: makeState([SNIPER, ENEMY]) },
    {
      what: 'a move pending',
      state: { ...makeState([SNIPER, ENEMY]), pendingMove: { from: { x: 0, y: 0 }, cost: 1 } },
    },
    { what: 'the bot on turn', state: makeState([SNIPER, ENEMY], 1) },
  ];

  it('names the unit on the cell and never an action, so the gesture sends nothing', () => {
    for (const { what, state } of states) {
      const intent = resolveInspect(state, ENEMY_CELL);

      expect(intent, what).toEqual({ kind: 'inspect', unitId: 'B-priest' });
      // The whole difference from `resolveClick`: there is no action here to send (D2, D4).
      expect(intent, what).not.toHaveProperty('action');
    }
  });

  it('answers nothing on a cell nobody stands on, so the gesture closes the inspection', () => {
    expect(resolveInspect(makeState([SNIPER, ENEMY]), { x: 1, y: 1 })).toEqual({ kind: 'none' });
  });

  it('answers nothing for a unit out of the fight, which covers no cells', () => {
    const body = makeUnit({ id: 'B-priest', team: 'B', at: { x: 3, y: 0 }, defeated: true });
    const state = makeState([SNIPER, body]);

    expect(resolveInspect(state, ENEMY_CELL)).toEqual({ kind: 'none' });
  });

  it('leaves the state it read untouched, so the acting unit and the turn stay where they are', () => {
    for (const { what, state } of states) {
      const before = structuredClone(state);

      resolveInspect(state, ENEMY_CELL);

      expect(state, what).toEqual(before);
    }
  });
});
