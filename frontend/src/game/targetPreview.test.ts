// EA-18: the odds behind an aim, read without rolling. Pure — no Phaser, no DOM — so the arithmetic is
// tested against the engine's own `hitChanceFor` directly, the same way `highlight.ts` is tested
// against `attackArea` and `reachableCells`.
import { describe, expect, it } from 'vitest';
import { hitChanceFor } from '@eldritch-alley/engine';
import type { AbilityDefinition, BoardState, PublicState, UnitState } from '../protocol';
import { abilityChances, attackChance } from './targetPreview';

const BOARD: BoardState = { width: 8, height: 8, levels: new Array<number>(64).fill(0), props: [] };

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

function stateWith(units: UnitState[], catalog: readonly AbilityDefinition[] = []): PublicState {
  return {
    seed: 1,
    board: BOARD,
    catalog,
    units,
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

describe('attackChance', () => {
  it("matches the engine's own hitChanceFor exactly", () => {
    const attacker = makeUnit('attacker', { position: { x: 0, y: 0 }, hitChance: 70 });
    const target = makeUnit('target', { position: { x: 2, y: 0 }, facing: 'W' });
    const state = stateWith([attacker, target]);

    expect(attackChance(state, attacker, target)).toBe(hitChanceFor(state, attacker, target));
  });

  it('reads cover like any basic attack, never lifting the penalty', () => {
    const attacker = makeUnit('attacker', { position: { x: 0, y: 0 } });
    const target = makeUnit('target', { position: { x: 2, y: 0 } });
    const board: BoardState = { ...BOARD, props: [{ position: { x: 1, y: 0 }, kind: 'cover' }] };
    const state = { ...stateWith([attacker, target]), board };

    expect(attackChance(state, attacker, target)).toBe(hitChanceFor(state, attacker, target, false));
    expect(attackChance(state, attacker, target)).not.toBe(hitChanceFor(state, attacker, target, true));
  });
});

describe('abilityChances', () => {
  it('answers one entry for a single-target ability, whoever stands on the aimed cell', () => {
    const caster = makeUnit('caster', { position: { x: 0, y: 0 } });
    const occupant = makeUnit('occupant', { position: { x: 3, y: 0 }, team: 'B' });
    const state = stateWith([caster, occupant], [PIERCING_SHOT]);

    const chances = abilityChances(state, caster, PIERCING_SHOT, { x: 3, y: 0 });

    expect([...chances.keys()]).toEqual(['occupant']);
    expect(chances.get('occupant')).toBe(hitChanceFor(state, caster, occupant, true));
  });

  it('answers nothing for a cell nobody stands on', () => {
    const caster = makeUnit('caster', { position: { x: 0, y: 0 } });
    const state = stateWith([caster], [PIERCING_SHOT]);

    expect(abilityChances(state, caster, PIERCING_SHOT, { x: 5, y: 5 }).size).toBe(0);
  });

  it('answers one entry per living unit inside the blast, allies and the caster included', () => {
    const caster = makeUnit('caster', { position: { x: 2, y: 0 }, primaryClass: 'wizard', resourceKind: 'mana' });
    const ally = makeUnit('ally', { position: { x: 1, y: 0 }, team: 'A' });
    const enemy = makeUnit('enemy', { position: { x: 3, y: 0 }, team: 'B' });
    const far = makeUnit('far', { position: { x: 6, y: 6 }, team: 'B' });
    const state = stateWith([caster, ally, enemy, far], [FIREBALL]);

    const chances = abilityChances(state, caster, FIREBALL, { x: 2, y: 0 });

    expect(new Set(chances.keys())).toEqual(new Set(['caster', 'ally', 'enemy']));
  });

  it('answers nothing for a heal effect — it never rolls', () => {
    const caster = makeUnit('caster', { position: { x: 2, y: 0 } });
    const ally = makeUnit('ally', { position: { x: 2, y: 0 } });
    const state = stateWith([caster, ally], [AREA_HEAL]);

    expect(abilityChances(state, caster, AREA_HEAL, { x: 2, y: 0 }).size).toBe(0);
  });

  it('excludes a defeated or permanently dead unit inside the radius', () => {
    const caster = makeUnit('caster', { position: { x: 2, y: 0 } });
    const down = makeUnit('down', { position: { x: 2, y: 0 }, defeated: true });
    const gone = makeUnit('gone', { position: { x: 3, y: 0 }, permanentlyDead: true });
    const state = stateWith([caster, down, gone], [FIREBALL]);

    expect([...abilityChances(state, caster, FIREBALL, { x: 2, y: 0 }).keys()]).toEqual(['caster']);
  });

  it('never mutates the state it is handed', () => {
    const caster = makeUnit('caster', { position: { x: 2, y: 0 } });
    const ally = makeUnit('ally', { position: { x: 1, y: 0 } });
    const state = stateWith([caster, ally], [FIREBALL]);
    const before = JSON.parse(JSON.stringify(state));

    abilityChances(state, caster, FIREBALL, { x: 2, y: 0 });
    attackChance(state, caster, ally);

    expect(state).toEqual(before);
  });
});
