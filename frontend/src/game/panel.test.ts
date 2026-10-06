import { describe, expect, it } from 'vitest';
import type { Board, PublicState, Team, UnitId, UnitState } from '../protocol';
import { unitPanel, type PanelRow } from './panel';

const BOARD: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };

interface UnitSpec {
  id: UnitId;
  team: Team;
  health?: number;
  maxHealth?: number;
  movement?: number;
  magazine?: number | null;
  ammo?: number;
}

function makeUnit(spec: UnitSpec): UnitState {
  const magazine = spec.magazine === undefined ? 3 : spec.magazine;
  return {
    id: spec.id,
    team: spec.team,
    position: { x: 0, y: 0 },
    speed: 10,
    health: spec.health ?? 12,
    maxHealth: spec.maxHealth ?? 12,
    attack: 4,
    hitChance: 80,
    range: 3,
    magazine,
    movement: spec.movement ?? 3,
    nerve: 50,
    attunement: 50,
    primaryClass: 'sniper',
    equipment: { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null },
    abilities: { activeSets: [null, null], reaction: null, movement: null, support: null },
    movementProfile: { maxStepUp: 1, maxStepDown: 1, climbCost: 1 },
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

function rowOf(state: PublicState, key: PanelRow['key'], unitId = 'A-sniper'): PanelRow {
  const row = unitPanel(state, unitId).find((candidate) => candidate.key === key);
  if (!row) throw new Error(`the panel has no row ${key}`);
  return row;
}

const SNIPER = makeUnit({ id: 'A-sniper', team: 'A' });
const WIZARD = makeUnit({ id: 'A-wizard', team: 'A', magazine: null });

describe('unitPanel', () => {
  it('shows nothing when no unit is selected', () => {
    expect(unitPanel(makeState([SNIPER]), null)).toEqual([]);
  });

  it('shows nothing for a unit the state does not carry', () => {
    expect(unitPanel(makeState([SNIPER]), 'A-nobody')).toEqual([]);
  });

  it('lists the rows in order', () => {
    const keys = unitPanel(makeState([SNIPER]), 'A-sniper').map((row) => row.key);

    expect(keys).toEqual(['hp', 'movement', 'action', 'ammo', 'reaction', 'mana']);
  });

  it('shows the health against the maximum, with the matching fill', () => {
    const state = makeState([makeUnit({ id: 'A-sniper', team: 'A', health: 3, maxHealth: 12 })]);

    const hp = rowOf(state, 'hp');

    expect(hp.label).toBe('HP');
    expect(hp.value).toBe('3/12');
    expect(hp.fill).toBe(0.25);
    expect(hp.enabled).toBe(true);
  });

  it('shows the movement left of the unit whose turn it is, with the matching fill', () => {
    const state = makeState([SNIPER], 0, { movementLeft: 2 });

    const movement = rowOf(state, 'movement');

    expect(movement.label).toBe('Movimento');
    expect(movement.value).toBe('2/3');
    expect(movement.fill).toBeCloseTo(2 / 3);
  });

  it('reports the action as available before it is used and spent after', () => {
    expect(rowOf(makeState([SNIPER]), 'action').value).toBe('Disponível');
    expect(rowOf(makeState([SNIPER], 0, { hasActed: true }), 'action').value).toBe('Gasta');
  });

  it('shows no movement and no action for a unit that is not the one on turn', () => {
    const state = makeState([SNIPER, WIZARD], 1);

    const movement = rowOf(state, 'movement', 'A-sniper');
    const action = rowOf(state, 'action', 'A-sniper');

    expect(movement.value).toBe('—');
    expect(movement.fill).toBeNull();
    expect(action.value).toBe('—');
    expect(action.fill).toBeNull();
  });

  it('shows the rounds left in the magazine', () => {
    const state = makeState([makeUnit({ id: 'A-sniper', team: 'A', ammo: 2 })]);

    const ammo = rowOf(state, 'ammo');

    expect(ammo.label).toBe('Munição');
    expect(ammo.value).toBe('2/3');
  });

  it('shows no ammunition for a class that carries no magazine', () => {
    const ammo = rowOf(makeState([WIZARD]), 'ammo', 'A-wizard');

    expect(ammo.value).toBe('—');
    expect(ammo.fill).toBeNull();
  });

  it('keeps the reaction and the mana, dimmed and without a value', () => {
    const state = makeState([SNIPER]);

    const reaction = rowOf(state, 'reaction');
    const mana = rowOf(state, 'mana');

    expect(reaction.label).toBe('Reação');
    expect(mana.label).toBe('Mana');
    for (const row of [reaction, mana]) {
      expect(row.value).toBe('—');
      expect(row.fill).toBeNull();
      expect(row.enabled).toBe(false);
    }
  });

  it('marks as enabled exactly the rows the engine can answer', () => {
    const enabled = unitPanel(makeState([SNIPER]), 'A-sniper')
      .filter((row) => row.enabled)
      .map((row) => row.key);

    expect(enabled).toEqual(['hp', 'movement', 'action', 'ammo']);
  });
});
