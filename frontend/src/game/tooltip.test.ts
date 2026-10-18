// The tooltip of what the mouse is over: the mud under it, a unit in camouflage, or a body with the
// rounds it has left. Pure — no Phaser, no DOM — so the precedence between the three is read here
// and the scene only hands the sentence to the HUD.
//
// The body's count is `corpseRoundsLeft`, the same number the skull bubble over the body wears, so
// the two readouts of a corpse can never disagree.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLocale, setLocale } from '../i18n/translate';
import type { Cell } from '../view/grid';
import type { DifficultCell, PublicState, UnitState } from '../protocol';
import { hoverTooltip } from './tooltip';

const BOARD: PublicState['board'] = { width: 8, height: 8, levels: new Array<number>(64).fill(0), props: [] };

function makeUnit(id: string, overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    team: 'A',
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
    facing: 'E',
    resourceKind: 'ammo',
    defeated: false,
    ammo: 3,
    permanentlyDead: false,
    corpseExpiresAtRound: null,
    camouflage: null,
    prone: false,
    ...overrides,
  };
}

function stateWith(
  units: readonly UnitState[],
  mud: readonly DifficultCell[] = [],
  round = 4,
): PublicState {
  return {
    seed: 1,
    board: BOARD,
    catalog: [],
    units: [...units],
    initiative: units.map((unit) => unit.id),
    currentIndex: 0,
    movementLeft: 3,
    round,
    hasActed: false,
    eventCount: 0,
    pendingMove: null,
    difficultTerrain: [...mud],
  };
}

function muddy(x: number, y: number, expiresAtRound = 8): DifficultCell {
  return { position: { x, y }, expiresAtRound };
}

const MUD_CELL: Cell = { x: 2, y: 2 };

describe('hoverTooltip', () => {
  // The sentences are read through `t`, so the reference locale is pinned here, as the other
  // language-bearing modules do.
  let previous = getLocale();
  beforeEach(() => {
    previous = getLocale();
    setLocale('pt-BR');
  });
  afterEach(() => setLocale(previous));

  it('names the difficult terrain under the mouse when no unit covers it', () => {
    const state = stateWith([], [muddy(2, 2)]);

    expect(hoverTooltip(state, MUD_CELL, null, 'A')).toBe('Terreno difícil! Chance de queda.');
  });

  it('has nothing to say about a tile with no mud and no unit', () => {
    const state = stateWith([makeUnit('A-sniper')]);

    expect(hoverTooltip(state, { x: 4, y: 4 }, null, 'A')).toBeNull();
    expect(hoverTooltip(state, null, null, 'A')).toBeNull();
  });

  it('names the camouflage of a hidden unit, over the mud it stands on', () => {
    const hidden = makeUnit('B-sniper', {
      team: 'B',
      position: { x: 2, y: 2 },
      camouflage: { turns: 2, breakChance: 30 },
    });
    const state = stateWith([hidden], [muddy(2, 2)]);

    expect(hoverTooltip(state, MUD_CELL, 'B-sniper', 'A')).toBe(
      'Em camuflagem. Não pode ser alvejado diretamente.',
    );
  });

  it('has nothing to say about a living unit standing in the open', () => {
    const plain = makeUnit('A-sniper', { position: { x: 2, y: 2 } });
    const state = stateWith([plain]);

    expect(hoverTooltip(state, MUD_CELL, 'A-sniper', 'A')).toBeNull();
  });

  it("reads an ally's body with the rounds it has left", () => {
    const body = makeUnit('A-priest', {
      defeated: true,
      corpseExpiresAtRound: 6,
      position: { x: 2, y: 2 },
    });
    const state = stateWith([body], [], 4);

    expect(hoverTooltip(state, MUD_CELL, 'A-priest', 'A')).toBe(
      'Aliado caído. Morte permanente em 2 turnos.',
    );
  });

  it("reads an enemy's body, in the singular when one round is left", () => {
    const body = makeUnit('B-priest', {
      team: 'B',
      defeated: true,
      corpseExpiresAtRound: 5,
      position: { x: 2, y: 2 },
    });
    const state = stateWith([body], [], 4);

    expect(hoverTooltip(state, MUD_CELL, 'B-priest', 'A')).toBe(
      'Inimigo caído. Morte permanente em 1 turno.',
    );
  });

  it("reads the side from the local player's team, not the unit id", () => {
    const body = makeUnit('A-priest', { defeated: true, corpseExpiresAtRound: 6 });

    expect(hoverTooltip(stateWith([body]), null, 'A-priest', 'B')).toBe(
      'Inimigo caído. Morte permanente em 2 turnos.',
    );
  });

  it('ignores a unit removed for good and reads the tile under it', () => {
    const gone = makeUnit('A-priest', {
      defeated: true,
      permanentlyDead: true,
      camouflage: { turns: 1, breakChance: 30 },
      position: { x: 2, y: 2 },
    });
    const state = stateWith([gone], [muddy(2, 2)]);

    expect(hoverTooltip(state, MUD_CELL, 'A-priest', 'A')).toBe('Terreno difícil! Chance de queda.');
  });

  it('never calls a body camouflaged, even one with no expiry to count', () => {
    const odd = makeUnit('A-priest', {
      defeated: true,
      corpseExpiresAtRound: null,
      camouflage: { turns: 1, breakChance: 30 },
      position: { x: 2, y: 2 },
    });
    const state = stateWith([odd], [muddy(2, 2)]);

    expect(hoverTooltip(state, MUD_CELL, 'A-priest', 'A')).toBe('Terreno difícil! Chance de queda.');
  });

  it('falls through to the tile when the id names no unit of the state', () => {
    const state = stateWith([], [muddy(2, 2)]);

    expect(hoverTooltip(state, MUD_CELL, 'B-ghost', 'A')).toBe('Terreno difícil! Chance de queda.');
  });

  it('speaks the language of the locale, both sides and both counts', () => {
    setLocale('en-US');
    const ally = makeUnit('A-priest', { defeated: true, corpseExpiresAtRound: 5 });
    const enemy = makeUnit('B-priest', { team: 'B', defeated: true, corpseExpiresAtRound: 6 });
    const state = stateWith([ally, enemy], [muddy(2, 2)]);

    expect(hoverTooltip(state, null, 'A-priest', 'A')).toBe('Fallen ally. Permanent death in 1 turn.');
    expect(hoverTooltip(state, null, 'B-priest', 'A')).toBe(
      'Fallen enemy. Permanent death in 2 turns.',
    );
    expect(hoverTooltip(state, MUD_CELL, null, 'A')).toBe('Difficult terrain! Chance of falling.');
  });
});
