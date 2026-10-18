import { newMatch, type AbilityDefinition, type MatchSetup } from '@eldritch-alley/engine';
import { describe, expect, it } from 'vitest';
import { ABILITY_CATALOG, CLASS_ABILITIES } from './abilities';
import { createMatchSetup, MAPS } from './map';

function definition(id: string): AbilityDefinition {
  const found = ABILITY_CATALOG.find((ability) => ability.id === id);
  if (!found) throw new Error(`no definition for ${id}`);
  return found;
}

function unitOf(setup: MatchSetup, id: string) {
  const unit = [...setup.teams[0], ...setup.teams[1]].find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`no unit ${id}`);
  return unit;
}

/**
 * The six definitions the server ships are provisional numbers, but the *shape* of each is what the
 * mechanism is tested against: a single target that beats cover, an area that beats cover, a support
 * effect that needs no sight, a self-cast status, a terrain layer and a revival. Every case below reads
 * the class's own spec through the roster rather than repeating the number, so the table and the class
 * cannot drift apart in silence.
 */
describe('the ability catalog', () => {
  it('defines the sniper shot as the class attack plus two, on one cell, through cover', () => {
    const sniper = unitOf(createMatchSetup(), 'A-sniper');

    expect(CLASS_ABILITIES.sniper[0]).toBe('piercing-shot');
    expect(definition('piercing-shot')).toEqual({
      id: 'piercing-shot',
      cost: 1,
      range: 4,
      needsSight: true,
      effect: { kind: 'damage', amount: sniper.attack + 2, radius: 0, ignoresCover: true },
    });
    // One round of the magazine: the shot is payable from the pool the class already carries.
    expect(definition('piercing-shot').cost).toBeLessThanOrEqual(sniper.magazine ?? 0);
  });

  it('defines the wizard fireball as three damage over a radius of one, through cover', () => {
    const wizard = unitOf(createMatchSetup(), 'A-wizard');

    expect(CLASS_ABILITIES.wizard[0]).toBe('fireball');
    expect(definition('fireball')).toEqual({
      id: 'fireball',
      cost: 2,
      range: 3,
      needsSight: true,
      effect: { kind: 'damage', amount: 3, radius: 1, ignoresCover: true },
    });
    // A cost above the capacity would be an ability the class can never pay for.
    expect(definition('fireball').cost).toBeLessThanOrEqual(wizard.magazine ?? 0);
  });

  it('defines the priest heal as three health over a radius of one, needing no sight', () => {
    const priest = unitOf(createMatchSetup(), 'A-priest');

    expect(CLASS_ABILITIES.priest[0]).toBe('area-heal');
    expect(definition('area-heal')).toEqual({
      id: 'area-heal',
      cost: 2,
      range: 3,
      needsSight: false,
      effect: { kind: 'heal', amount: 3, radius: 1 },
    });
    expect(definition('area-heal').cost).toBeLessThanOrEqual(priest.magazine ?? 0);
  });

  it('defines the sniper camouflage as a three-turn self status with a 30% break', () => {
    const sniper = unitOf(createMatchSetup(), 'A-sniper');

    expect(CLASS_ABILITIES.sniper[1]).toBe('camouflage');
    expect(definition('camouflage')).toEqual({
      id: 'camouflage',
      cost: 3,
      range: 0,
      needsSight: false,
      effect: { kind: 'camouflage', radius: 0, turns: 3, breakChance: 30 },
    });
    // The cast is payable from the pool the class already carries, like its shot.
    expect(definition('camouflage').cost).toBeLessThanOrEqual(sniper.magazine ?? 0);
  });

  it('defines the wizard mud as a three-round layer over a radius of one', () => {
    const wizard = unitOf(createMatchSetup(), 'A-wizard');

    expect(CLASS_ABILITIES.wizard[1]).toBe('mud');
    expect(definition('mud')).toEqual({
      id: 'mud',
      cost: 1,
      range: 3,
      needsSight: true,
      effect: { kind: 'terrain', radius: 1, durationRounds: 3 },
    });
    expect(definition('mud').cost).toBeLessThanOrEqual(wizard.magazine ?? 0);
  });

  it('defines the priest resurrection as a revive, needing no sight', () => {
    const priest = unitOf(createMatchSetup(), 'A-priest');

    expect(CLASS_ABILITIES.priest[1]).toBe('resurrection');
    expect(definition('resurrection')).toEqual({
      id: 'resurrection',
      cost: 3,
      range: 3,
      needsSight: false,
      effect: { kind: 'revive', radius: 0 },
    });
    expect(definition('resurrection').cost).toBeLessThanOrEqual(priest.magazine ?? 0);
  });

  it('carries exactly one definition per id, six in all', () => {
    const ids = ABILITY_CATALOG.map((ability) => ability.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([
      'area-heal',
      'camouflage',
      'fireball',
      'mud',
      'piercing-shot',
      'resurrection',
    ]);
  });

  it('gives every class two slots, the first the ability it already carried', () => {
    expect(CLASS_ABILITIES).toEqual({
      sniper: ['piercing-shot', 'camouflage'],
      wizard: ['fireball', 'mud'],
      priest: ['area-heal', 'resurrection'],
    });
  });

  it('gives every class of the roster the two abilities the catalog defines', () => {
    const setup = createMatchSetup();

    for (const unit of [...setup.teams[0], ...setup.teams[1]]) {
      const slots = unit.abilities.activeSets;
      // The class's own pair is the one the table names, so a class cannot quietly carry another's.
      expect(slots, unit.id).toEqual(CLASS_ABILITIES[unit.primaryClass]);
      for (const id of slots) {
        expect(id, `${unit.id} carries an empty active slot`).not.toBeNull();
        expect(ABILITY_CATALOG.map((ability) => ability.id)).toContain(id);
      }
    }
  });

  it('draws no definition from a class the catalog leaves out', () => {
    expect(Object.keys(CLASS_ABILITIES).sort()).toEqual(['priest', 'sniper', 'wizard']);
  });
});

describe('the catalog of a match', () => {
  it('travels in the setup of every map the room can draw', () => {
    for (let seed = 0; seed < MAPS.length; seed += 1) {
      expect(createMatchSetup(seed).catalog, `seed ${seed}`).toEqual(ABILITY_CATALOG);
    }
  });

  it('is carried onto the match state, which is where an action reads it from', () => {
    // A setup without a catalog would leave every cast to answer `ability-unknown`, whatever the slots
    // of the unit say.
    expect(newMatch(createMatchSetup()).catalog).toEqual(ABILITY_CATALOG);
  });
});
