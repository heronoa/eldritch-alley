// The abilities the match server ships (ADR 0016). The engine knows none of this: it takes an id, a
// cost, a reach, a sight rule and one effect, and resolves whatever it is handed. What lives here is the
// data a class carries and the table m3-03 ships — provisional, and tuned in m3-04 against the rule.
import type { AbilityDefinition } from '@eldritch-alley/engine';

/**
 * The six definitions a match carries, two per class (ADR 0023 §2).
 *
 * The sniper's amount is written as its sum rather than read from the roster, so this module imports no
 * class and `map.ts` can import it without a cycle. `abilities.test.ts` asserts the number still equals
 * the roster's attack plus two, which is what keeps the ADR's table row and the class from drifting.
 */
export const ABILITY_CATALOG: readonly AbilityDefinition[] = [
  {
    id: 'piercing-shot',
    cost: 1,
    range: 4,
    needsSight: true,
    // The one single-target effect, and the one that beats cover: the sniper's answer to a crouched
    // target, which the basic attack pays 25 points of accuracy for.
    effect: { kind: 'damage', amount: 6, radius: 0, ignoresCover: true },
  },
  {
    id: 'fireball',
    cost: 2,
    range: 3,
    needsSight: true,
    // The one area: it hits everything standing in it, the caster and its own allies included, which is
    // what makes placing it the wizard's problem (ADR 0016 §12).
    effect: { kind: 'damage', amount: 3, radius: 1, ignoresCover: true },
  },
  {
    id: 'area-heal',
    cost: 2,
    range: 3,
    needsSight: false,
    // The one support effect, and the only one that needs no sight: it reaches an ally behind a wall.
    effect: { kind: 'heal', amount: 3, radius: 1 },
  },
  {
    id: 'camouflage',
    cost: 3,
    range: 0,
    needsSight: false,
    // The caster's own cell, and the only status in the catalog: a basic attack cannot name the unit
    // while it lasts (ADR 0023 §3).
    effect: { kind: 'camouflage', radius: 0, turns: 3, breakChance: 30 },
  },
  {
    id: 'mud',
    cost: 1,
    range: 3,
    needsSight: true,
    // A 3×3 layer of difficult ground: it doubles the step into it and may stop a unit prone (ADR 0023 §4).
    effect: { kind: 'terrain', radius: 1, durationRounds: 3 },
  },
  {
    id: 'resurrection',
    cost: 3,
    range: 3,
    needsSight: false,
    // It names the fallen body with `target` and the free cell it returns on with `to` (ADR 0023 §7).
    effect: { kind: 'revive', radius: 0 },
  },
];

/**
 * The two abilities each class carries, in slot order: the one it already carried, then the secondary
 * ability this milestone adds (ADR 0023 §2). A class is still two active sets; the reaction, movement
 * and support slots stay unread.
 */
export const CLASS_ABILITIES: Readonly<Record<string, readonly [string | null, string | null]>> = {
  sniper: ['piercing-shot', 'camouflage'],
  wizard: ['fireball', 'mud'],
  priest: ['area-heal', 'resurrection'],
};
