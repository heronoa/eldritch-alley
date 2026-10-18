import { describe, expect, it } from 'vitest';
import type { AbilityDefinition, BoardState, PublicState, Team, UnitId, UnitState } from '../protocol';
import { setLocale } from '../i18n/translate';
import { abilityOptions } from './ability-menu';

// The cases below assert the Portuguese copy the game shipped with, so they read it on purpose.
setLocale('pt-BR');

const BOARD: BoardState = { width: 8, height: 8, levels: new Array<number>(64).fill(0), props: [] };

interface UnitSpec {
  id: UnitId;
  team: Team;
  at?: { x: number; y: number };
  magazine?: number | null;
  ammo?: number;
  resourceKind?: 'ammo' | 'mana';
  /** The id of the one active ability the unit carries, in `activeSets[0]` (ADR 0016 §6). */
  ability?: string | null;
  /** The slots the engine does not read yet, filled to prove the menu leaves them alone (ADR 0016 §6). */
  extraSlots?: Partial<UnitState['abilities']>;
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
    range: 3,
    magazine,
    movement: 3,
    nerve: 50,
    attunement: 50,
    primaryClass: 'sniper',
    equipment: { armor: null, helmet: null, mainHand: null, offHand: null, accessory1: null, accessory2: null },
    abilities: {
      activeSets: [spec.ability ?? null, null],
      reaction: null,
      movement: null,
      support: null,
      ...spec.extraSlots,
    },
    movementProfile: { maxStepUp: 1, maxStepDown: 1, climbCost: 1 },
    facing: 'E',
    resourceKind: magazine === null ? null : (spec.resourceKind ?? 'ammo'),
    defeated: false,
    ammo: spec.ammo ?? (magazine === null ? 0 : magazine),
    permanentlyDead: false,
    corpseExpiresAtRound: null,
    camouflage: null,
    prone: false,
  };
}

function makeState(units: readonly UnitState[], catalog: readonly AbilityDefinition[]): PublicState {
  return {
    seed: 1,
    board: BOARD,
    catalog,
    units: [...units],
    initiative: units.map((unit) => unit.id),
    currentIndex: 0,
    movementLeft: 3,
    round: 1,
    hasActed: false,
    eventCount: 0,
    pendingMove: null,
    difficultTerrain: [],
  };
}

/** The three definitions the classes of m3-03 carry, as the match's catalog holds them. */
const PIERCING_SHOT: AbilityDefinition = {
  id: 'piercing-shot',
  cost: 1,
  range: 4,
  needsSight: true,
  effect: { kind: 'damage', amount: 6, radius: 0, ignoresCover: true },
};
const FIREBALL: AbilityDefinition = {
  id: 'fireball',
  cost: 2,
  range: 3,
  needsSight: true,
  effect: { kind: 'damage', amount: 3, radius: 1, ignoresCover: true },
};
const AREA_HEAL: AbilityDefinition = {
  id: 'area-heal',
  cost: 2,
  range: 3,
  needsSight: false,
  effect: { kind: 'heal', amount: 3, radius: 1 },
};
const CAMOUFLAGE: AbilityDefinition = {
  id: 'camouflage',
  cost: 3,
  range: 0,
  needsSight: false,
  effect: { kind: 'camouflage', radius: 0, turns: 3, breakChance: 30 },
};
const MUD: AbilityDefinition = {
  id: 'mud',
  cost: 1,
  range: 3,
  needsSight: true,
  effect: { kind: 'terrain', radius: 1, durationRounds: 3 },
};
const RESURRECTION: AbilityDefinition = {
  id: 'resurrection',
  cost: 3,
  range: 3,
  needsSight: false,
  effect: { kind: 'revive', radius: 0 },
};
const CATALOG: readonly AbilityDefinition[] = [
  PIERCING_SHOT,
  FIREBALL,
  AREA_HEAL,
  CAMOUFLAGE,
  MUD,
  RESURRECTION,
];

describe('abilityOptions', () => {
  it('names the ability, its cost in the unit\'s own pool, and what it does', () => {
    // The three things the owner asked the modal for (EA-16): the name, the cost and the effect.
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', ability: 'piercing-shot' });

    expect(abilityOptions(makeState([sniper], CATALOG), sniper)).toEqual([
      {
        id: 'piercing-shot',
        name: 'Tiro Perfurante',
        cost: '1 Munição',
        detail: 'Dano 6 · ignora cobertura',
        affordable: true,
      },
    ]);
  });

  it('reads the cost in energy for a class that pays from the magic pool', () => {
    // ADR 0011: the pool is the unit's own kind, and the row labels it the way its sheet does.
    const wizard = makeUnit({
      id: 'A-wizard',
      team: 'A',
      magazine: 3,
      ammo: 3,
      resourceKind: 'mana',
      ability: 'fireball',
    });

    expect(abilityOptions(makeState([wizard], CATALOG), wizard)).toEqual([
      {
        id: 'fireball',
        name: 'Bola de Fogo',
        cost: '2 Energia',
        detail: 'Dano 3 · raio 1 · ignora cobertura · atinge todos, inclusive aliados',
        affordable: true,
      },
    ]);
  });

  it('says a heal, its radius, and nothing about cover', () => {
    // A heal never rolls, so cover means nothing to it (ADR 0016 §10): the sentence that warns about
    // allies is the damage one, and it is not added here.
    const priest = makeUnit({
      id: 'A-priest',
      team: 'A',
      magazine: 3,
      ammo: 3,
      resourceKind: 'mana',
      ability: 'area-heal',
    });

    expect(abilityOptions(makeState([priest], CATALOG), priest)[0]?.detail).toBe('Cura 3 · raio 1');
  });

  it('dims the row the pool cannot pay instead of hiding it', () => {
    // The engine would refuse the use (ADR 0016 §7), so the row says so before the player aims — and
    // it is still there to be read, which is what an empty pool most needs (EA-16, D3).
    const wizard = makeUnit({
      id: 'A-wizard',
      team: 'A',
      magazine: 3,
      ammo: 1,
      resourceKind: 'mana',
      ability: 'fireball',
    });
    const rows = abilityOptions(makeState([wizard], CATALOG), wizard);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.affordable).toBe(false);
    expect(rows[0]?.cost).toBe('2 Energia');
  });

  it('offers nothing to a unit whose slots name no ability', () => {
    const sniper = makeUnit({ id: 'A-sniper', team: 'A', ability: null });

    expect(abilityOptions(makeState([sniper], CATALOG), sniper)).toEqual([]);
  });

  it('reads both active sets and leaves the other slots alone', () => {
    // `unknown` is named by the first slot and defined by nobody; the second one is real. The
    // reaction, movement and support slots stay unread (ADR 0016 §6, amended by ADR 0023 §1).
    const sniper = makeUnit({
      id: 'A-sniper',
      team: 'A',
      ability: 'unknown',
      extraSlots: {
        activeSets: ['unknown', 'fireball'],
        reaction: 'fireball',
        movement: 'fireball',
        support: 'fireball',
      },
    });

    expect(abilityOptions(makeState([sniper], CATALOG), sniper).map((row) => row.id)).toEqual([
      'fireball',
    ]);
  });

  it('offers both active sets, in slot order', () => {
    // The class's old ability first and the secondary one second (ADR 0023 §2).
    const sniper = makeUnit({
      id: 'A-sniper',
      team: 'A',
      ammo: 3,
      extraSlots: { activeSets: ['piercing-shot', 'camouflage'] },
    });
    const rows = abilityOptions(makeState([sniper], CATALOG), sniper);

    expect(rows.map((row) => row.id)).toEqual(['piercing-shot', 'camouflage']);
    expect(rows[1]).toEqual({
      id: 'camouflage',
      name: 'Camuflagem',
      cost: '3 Munição',
      detail: '3 turnos · quebra 30%',
      affordable: true,
    });
  });

  it('offers a single row to a class that carries a single ability', () => {
    const sniper = makeUnit({
      id: 'A-sniper',
      team: 'A',
      extraSlots: { activeSets: ['piercing-shot', null] },
    });

    expect(abilityOptions(makeState([sniper], CATALOG), sniper).map((row) => row.id)).toEqual([
      'piercing-shot',
    ]);
  });

  it('reads the numbers of the new kinds from the definition, not from constants', () => {
    // The row has to say what the match's own catalog says, so a server that tunes a number tunes
    // the sentence with it (ADR 0016 §1).
    const sniper = makeUnit({
      id: 'A-sniper',
      team: 'A',
      ammo: 3,
      extraSlots: { activeSets: [null, 'camouflage'] },
    });
    const shorter = {
      ...CAMOUFLAGE,
      effect: { kind: 'camouflage' as const, radius: 0 as const, turns: 2, breakChance: 45 },
    };
    expect(abilityOptions(makeState([sniper], [shorter]), sniper)[0]?.detail).toBe(
      '2 turnos · quebra 45%',
    );

    const wizard = makeUnit({
      id: 'A-wizard',
      team: 'A',
      magazine: null,
      resourceKind: 'mana',
      extraSlots: { activeSets: [null, 'mud'] },
    });
    const wider = {
      ...MUD,
      effect: { kind: 'terrain' as const, radius: 2, durationRounds: 5 },
    };
    expect(abilityOptions(makeState([wizard], [wider]), wizard)[0]?.detail).toBe(
      '5 rodadas · raio 2 · terreno difícil',
    );

    const priest = makeUnit({
      id: 'A-priest',
      team: 'A',
      magazine: null,
      resourceKind: 'mana',
      extraSlots: { activeSets: [null, 'resurrection'] },
    });
    expect(abilityOptions(makeState([priest], [RESURRECTION]), priest)[0]?.detail).toBe(
      'Revive um aliado caído',
    );
  });

  it('dims the camouflage a sniper cannot pay for, and keeps it on the menu', () => {
    const rich = makeUnit({
      id: 'A-sniper',
      team: 'A',
      ammo: 3,
      extraSlots: { activeSets: [null, 'camouflage'] },
    });
    const poor = makeUnit({
      id: 'A-sniper',
      team: 'A',
      ammo: 2,
      extraSlots: { activeSets: [null, 'camouflage'] },
    });

    expect(abilityOptions(makeState([rich], CATALOG), rich)[0]).toMatchObject({
      cost: '3 Munição',
      affordable: true,
    });
    expect(abilityOptions(makeState([poor], CATALOG), poor)[0]?.affordable).toBe(false);
  });

  it('names an ability this build cannot translate by its id rather than by a blank', () => {
    // The catalog belongs to the server and may carry an ability a later milestone added. The row has
    // to carry some handle the player can aim with, and the id is the one the server itself uses.
    const priest = makeUnit({
      id: 'A-priest',
      team: 'A',
      magazine: 3,
      ammo: 3,
      resourceKind: 'mana',
      ability: 'time-stop',
    });
    const definition: AbilityDefinition = {
      id: 'time-stop',
      cost: 1,
      range: 2,
      needsSight: false,
      effect: { kind: 'damage', amount: 1, radius: 0, ignoresCover: false },
    };

    expect(abilityOptions(makeState([priest], [definition]), priest)).toEqual([
      {
        id: 'time-stop',
        name: 'time-stop',
        cost: '1 Energia',
        detail: 'Dano 1',
        affordable: true,
      },
    ]);
  });
});
