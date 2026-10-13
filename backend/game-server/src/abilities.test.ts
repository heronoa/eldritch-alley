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
 * The three definitions m3-03 ships are provisional numbers, but the *shape* of each is what the
 * mechanism is tested against: a single target that beats cover, an area that beats cover, and a
 * support effect that needs no sight. Every case below reads the class's own spec through the roster
 * rather than repeating the number, so the table and the class cannot drift apart in silence.
 */
describe('the ability catalog', () => {
  it('defines the sniper shot as the class attack plus two, on one cell, through cover', () => {
    const sniper = unitOf(createMatchSetup(), 'A-sniper');

    expect(CLASS_ABILITIES.sniper).toBe('piercing-shot');
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

    expect(CLASS_ABILITIES.wizard).toBe('fireball');
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

    expect(CLASS_ABILITIES.priest).toBe('area-heal');
    expect(definition('area-heal')).toEqual({
      id: 'area-heal',
      cost: 2,
      range: 3,
      needsSight: false,
      effect: { kind: 'heal', amount: 3, radius: 1 },
    });
    expect(definition('area-heal').cost).toBeLessThanOrEqual(priest.magazine ?? 0);
  });

  it('carries exactly one definition per id, and no id the three classes do not name', () => {
    const ids = ABILITY_CATALOG.map((ability) => ability.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(['area-heal', 'fireball', 'piercing-shot']);
  });

  it('gives every class of the roster an ability the catalog defines', () => {
    const setup = createMatchSetup();

    for (const unit of [...setup.teams[0], ...setup.teams[1]]) {
      const id = unit.abilities.activeSets[0];
      expect(id, `${unit.id} carries no active ability`).not.toBeNull();
      expect(ABILITY_CATALOG.map((ability) => ability.id)).toContain(id);
      // The class's own slot is the one the table names, so a class cannot quietly carry another's.
      expect(id).toBe(CLASS_ABILITIES[unit.primaryClass as keyof typeof CLASS_ABILITIES]);
      // The second active set stays unread in this milestone (ADR 0016), so nothing fills it yet.
      expect(unit.abilities.activeSets[1]).toBeNull();
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
