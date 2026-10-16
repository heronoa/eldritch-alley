// The abilities the match server ships (ADR 0016). The engine knows none of this: it takes an id, a
// cost, a reach, a sight rule and one effect, and resolves whatever it is handed. What lives here is the
// data a class carries and the table m3-03 ships — provisional, and tuned in m3-04 against the rule.
import type { AbilityDefinition } from '@eldritch-alley/engine';

/**
 * The three definitions a match carries, one per class.
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
];

/**
 * The ability each class carries in its first active set. A class is one ability this milestone; the
 * second set and the reaction, movement and support slots stay unread (ADR 0016, Consequences).
 */
export const CLASS_ABILITIES: Readonly<Record<string, string>> = {
  sniper: 'piercing-shot',
  wizard: 'fireball',
  priest: 'area-heal',
};
