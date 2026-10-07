import { describe, expect, it } from 'vitest';
import type { BoardState, PublicState, Team, UnitId, UnitState } from '../protocol';
import { activeSlot, isHumanTurn, turnOrder } from './turn-order';

const BOARD: BoardState = { width: 8, height: 8, levels: new Array<number>(64).fill(0), props: [] };

interface UnitSpec {
  id: UnitId;
  team: Team;
  defeated?: boolean;
}

function makeUnit(spec: UnitSpec): UnitState {
  return {
    id: spec.id,
    team: spec.team,
    position: { x: 0, y: 0 },
    speed: 10,
    health: 12,
    maxHealth: 12,
    attack: 4,
    hitChance: 80,
    range: 3,
    magazine: 3,
    movement: 3,
    nerve: 50,
    attunement: 50,
    primaryClass: 'sniper',
    equipment: { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null },
    abilities: { activeSets: [null, null], reaction: null, movement: null, support: null },
    movementProfile: { maxStepUp: 1, maxStepDown: 1, climbCost: 1 },
    resourceKind: 'ammo',
    defeated: spec.defeated ?? false,
    ammo: 3,
    permanentlyDead: false,
    corpseExpiresAtRound: null,
  };
}

/** The real initiative only ever holds the units still in play, and the state keeps the fallen. */
function makeState(units: readonly UnitState[], currentIndex = 0): PublicState {
  return {
    seed: 1,
    board: BOARD,
    units: [...units],
    initiative: units.filter((unit) => !unit.defeated).map((unit) => unit.id),
    currentIndex,
    movementLeft: 3,
    round: 1,
    hasActed: false,
    eventCount: 0,
    pendingMove: null,
  };
}

const SNIPER = makeUnit({ id: 'A-sniper', team: 'A' });
const BOT_SNIPER = makeUnit({ id: 'B-sniper', team: 'B' });
const WIZARD = makeUnit({ id: 'A-wizard', team: 'A' });
const SQUAD = [SNIPER, BOT_SNIPER, WIZARD];

function idsOf(state: PublicState): UnitId[] {
  return turnOrder(state).map((slot) => slot.unit.id);
}

describe('turnOrder', () => {
  it('lists the queue in turn order', () => {
    expect(idsOf(makeState(SQUAD, 0))).toEqual(['A-sniper', 'B-sniper', 'A-wizard']);
  });

  it('puts the unit whose turn it is first', () => {
    expect(idsOf(makeState(SQUAD, 1))).toEqual(['B-sniper', 'A-wizard', 'A-sniper']);
  });

  it('carries the rest of the queue after it, wrapping around', () => {
    expect(idsOf(makeState(SQUAD, 2))).toEqual(['A-wizard', 'A-sniper', 'B-sniper']);
  });

  it('marks only the first slot as the current one', () => {
    expect(turnOrder(makeState(SQUAD, 1)).map((slot) => slot.isCurrent)).toEqual([true, false, false]);
  });

  it('hands back the unit itself, so the caller can draw it', () => {
    const slot = turnOrder(makeState(SQUAD, 1))[0];

    expect(slot.unit).toBe(BOT_SNIPER);
  });

  it('leaves out a unit that is no longer in play', () => {
    const wounded = [SNIPER, { ...BOT_SNIPER, defeated: true }, WIZARD];

    expect(idsOf(makeState(wounded, 0))).toEqual(['A-sniper', 'A-wizard']);
  });

  it('returns nothing when the queue is empty', () => {
    expect(turnOrder(makeState([]))).toEqual([]);
  });
});

describe('activeSlot', () => {
  it('answers with the unit the initiative has at the current index', () => {
    const slot = activeSlot(makeState(SQUAD, 1));

    expect(slot?.unit).toBe(BOT_SNIPER);
  });

  it('marks the slot it answers with as the current one, like the head of the queue', () => {
    expect(activeSlot(makeState(SQUAD, 2))).toEqual(turnOrder(makeState(SQUAD, 2))[0]);
  });

  it('returns null when the match is over and no unit is left on turn', () => {
    expect(activeSlot(makeState([]))).toBeNull();
  });

  it('returns null when the index points past the queue', () => {
    expect(activeSlot(makeState(SQUAD, SQUAD.length))).toBeNull();
  });

  it('returns null when the queue names a unit the state does not carry', () => {
    const state = { ...makeState(SQUAD, 0), initiative: ['A-nobody'] };

    expect(activeSlot(state)).toBeNull();
  });
});

describe('isHumanTurn', () => {
  it('is true when the unit on turn belongs to the human team', () => {
    expect(isHumanTurn(makeState(SQUAD, 0), 'A')).toBe(true);
  });

  it('is false when the unit on turn belongs to the other team', () => {
    expect(isHumanTurn(makeState(SQUAD, 1), 'A')).toBe(false);
  });

  it('follows the side it is asked about, not the side that plays the client', () => {
    expect(isHumanTurn(makeState(SQUAD, 1), 'B')).toBe(true);
  });

  it('is false when nobody is on turn', () => {
    expect(isHumanTurn(makeState([]), 'A')).toBe(false);
  });
});
