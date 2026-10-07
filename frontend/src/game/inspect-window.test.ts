// The unit inspection window (smoke test 2, slice E): what a right-click on a unit answers with.
// The rows are the owner's own list — health, the resource the class carries, how far the unit can
// walk in a turn, and how many reactions it has — and the sheet is a question, never a command.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Board, PublicState, Team, UnitId, UnitState } from '../protocol';
import { unitSheet } from './inspect-window';
import { setLocale } from '../i18n/translate';

// The window's copy is the Portuguese the game shipped with, so these cases read it on purpose.
beforeEach(() => setLocale('pt-BR'));

const BOARD: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };

interface UnitSpec {
  id?: UnitId;
  primaryClass?: string;
  health?: number;
  maxHealth?: number;
  movement?: number;
  magazine?: number | null;
  ammo?: number;
  reaction?: string | null;
  defeated?: boolean;
}

function makeUnit(spec: UnitSpec = {}): UnitState {
  const magazine = spec.magazine === undefined ? 3 : spec.magazine;
  return {
    id: spec.id ?? 'A-1',
    team: 'A' as Team,
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
    primaryClass: spec.primaryClass ?? 'sniper',
    equipment: { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null },
    abilities: {
      activeSets: [null, null],
      reaction: spec.reaction ?? null,
      movement: null,
      support: null,
    },
    movementProfile: { maxStepUp: 1, maxStepDown: 1, climbCost: 1 },
    // The pool a basic attack spends, filled the way `newMatch` fills it: a magazine implies a kind.
    resourceKind: magazine === null ? null : 'ammo',
    defeated: spec.defeated ?? false,
    ammo: spec.ammo ?? (magazine === null ? 0 : magazine),
    permanentlyDead: false,
    corpseExpiresAtRound: null,
  };
}

function makeState(units: readonly UnitState[]): PublicState {
  return {
    seed: 1,
    board: BOARD,
    units: [...units],
    initiative: units.map((unit) => unit.id),
    currentIndex: 0,
    movementLeft: 3,
    round: 1,
    hasActed: false,
    eventCount: 0,
    pendingMove: null,
  };
}

/** A sheet as the tests read it: its rows by their key, which is what a drawing asks for. */
function rowsOf(state: PublicState, unitId: UnitId | null) {
  const sheet = unitSheet(state, unitId);
  return sheet === null ? null : Object.fromEntries(sheet.rows.map((row) => [row.key, row]));
}

describe('unitSheet', () => {
  it('answers with nothing when no unit is being inspected', () => {
    expect(unitSheet(makeState([makeUnit()]), null)).toBeNull();
  });

  it('answers with nothing for a unit the state does not carry', () => {
    expect(unitSheet(makeState([makeUnit()]), 'B-9')).toBeNull();
  });

  it('shows the four rows of the sheet, in the order the owner listed them', () => {
    const sheet = unitSheet(makeState([makeUnit()]), 'A-1');

    expect(sheet?.rows.map((row) => row.key)).toEqual(['hp', 'resource', 'movement', 'reaction']);
  });

  it('shows the health over the ceiling it entered the match with', () => {
    const state = makeState([makeUnit({ health: 5, maxHealth: 12 })]);

    expect(rowsOf(state, 'A-1')?.hp).toMatchObject({ label: 'HP', value: '5/12' });
  });

  it('shows the ammunition over the magazine, for a class that carries one', () => {
    const state = makeState([makeUnit({ magazine: 5, ammo: 2 })]);

    expect(rowsOf(state, 'A-1')?.resource).toMatchObject({ label: 'Munição', value: '2/5' });
  });

  it('shows mana, and no ammunition, for a class with no magazine', () => {
    const state = makeState([makeUnit({ primaryClass: 'wizard', magazine: null })]);

    expect(rowsOf(state, 'A-1')?.resource).toMatchObject({ label: 'Mana' });
  });

  it('shows the most the unit can walk in a turn, not what is left of it', () => {
    // The window is a sheet, not the turn's panel: a unit that is not on turn still has a movement.
    const state = makeState([makeUnit({ movement: 4, id: 'B-1' })]);

    expect(rowsOf(state, 'B-1')?.movement).toMatchObject({ label: 'Movimento', value: '4' });
  });

  it('counts one reaction for a unit whose slot is filled, and none for one whose slot is empty', () => {
    const armed = makeState([makeUnit({ id: 'A-1', reaction: 'overwatch' })]);
    const bare = makeState([makeUnit({ id: 'B-1', reaction: null })]);

    expect(rowsOf(armed, 'A-1')?.reaction).toMatchObject({ label: 'Reação', value: '1' });
    expect(rowsOf(bare, 'B-1')?.reaction).toMatchObject({ label: 'Reação', value: '0' });
  });

  it('still answers for a defeated unit, which is what a player asks about one', () => {
    const state = makeState([makeUnit({ health: 0, defeated: true })]);

    expect(rowsOf(state, 'A-1')?.hp).toMatchObject({ value: '0/12' });
  });

  it('carries a title, so the window says what it is a sheet of', () => {
    expect(unitSheet(makeState([makeUnit()]), 'A-1')?.title).toBe('Ficha da unidade');
  });
});
