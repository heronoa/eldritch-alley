// What the ability menu shows (EA-16): the rows the `Habilidade` button opens before the aim does.
//
// It is pure and it reads the match's own catalog, so the content of the modal is tested without a
// browser and the scene that draws it decides nothing — the same split the unit sheet and the action
// bar are built on.
//
// Both active sets are offered, in slot order (ADR 0023 §2): the class's old ability first, the
// secondary one second. The other three slots stay unread, as ADR 0016 §6 has them. The rows are built
// from the slots and not from the class, so a class that carries one ability draws one row.
import { abilityById } from '@eldritch-alley/engine';
import { abilityName, t } from '../i18n';
import type { AbilityDefinition, PublicState, UnitState } from '../protocol';

/** One row of the menu: what the ability is called, what it costs, and what it does. */
export interface AbilityOption {
  readonly id: string;
  /**
   * The word the catalogs give the id, or the id itself when this build has no word for it: a row has
   * to carry some handle the player can read, and an id is better than a blank line.
   */
  readonly name: string;
  /** The cost and the pool it is paid from, in the words of the unit's own sheet: `'2 Energia'`. */
  readonly cost: string;
  /** The effect in the player's words, the fragments of the catalog joined in one line. */
  readonly detail: string;
  /** Whether the unit's own pool covers the cost. A row it cannot pay is drawn dimmed (EA-16, D3). */
  readonly affordable: boolean;
}

/**
 * The slots the menu offers: every non-null entry of `activeSets`, in slot order (ADR 0023 §2). The
 * reaction, the movement and the support slots stay unread (ADR 0016 §6), and the engine refuses a use
 * its own slots do not name — so offering one would be a row the server turns down.
 */
function offeredIds(unit: UnitState): readonly string[] {
  return unit.abilities.activeSets.filter((id): id is string => id !== null);
}

/**
 * The first ability the unit's active sets name that the match's own catalog defines, or undefined when
 * none of them resolves (ADR 0016 §6, amended by ADR 0023 §2). The slots are read in order, so
 * `activeSets[0]` stays the fallback for a caller that never opened the menu (I11). The aim, the
 * highlight and the ability button all read the slots through here.
 */
export function carriedAbility(
  state: PublicState,
  unit: UnitState,
): AbilityDefinition | undefined {
  for (const id of unit.abilities.activeSets) {
    if (id === null) continue;
    const ability = abilityById(state.catalog, id);
    if (ability !== undefined) return ability;
  }
  return undefined;
}

/**
 * What the ability costs the caster: the amount and the pool it is paid from, labelled the way the unit
 * sheet labels that pool (ADR 0011) — energy for a magic class, rounds for a weapon one.
 */
function costLabel(unit: UnitState, cost: number): string {
  const pool = t(unit.resourceKind === 'mana' ? 'panel.label.energy' : 'panel.label.ammo');
  return `${cost} ${pool}`;
}

/**
 * The effect in words, as the fragments of the catalog joined in the order they read: what it does, how
 * wide it is, and the rules it carries. A heal never rolls, so cover means nothing to it (ADR 0016 §10);
 * a damage effect that covers more than one cell hurts every body inside it (ADR 0016 §12), which is the
 * one rule the player has to read before aiming. The three effects of the second active set each say
 * their own numbers, read from the definition the match carries (ADR 0023 §2).
 */
function detailOf(effect: AbilityDefinition['effect']): string {
  switch (effect.kind) {
    case 'damage':
    case 'heal': {
      const parts = [
        effect.kind === 'heal'
          ? t('ability.detail.heal', { amount: effect.amount })
          : t('ability.detail.damage', { amount: effect.amount }),
      ];

      if (effect.radius > 0) parts.push(t('ability.detail.radius', { radius: effect.radius }));
      if (effect.kind === 'damage' && effect.ignoresCover) {
        parts.push(t('ability.detail.ignoresCover'));
      }
      if (effect.kind === 'damage' && effect.radius > 0) parts.push(t('ability.detail.hitsAllies'));

      return parts.join(' · ');
    }
    case 'camouflage':
      return [
        t('ability.detail.camouflage', { turns: effect.turns }),
        t('ability.detail.breakChance', { chance: effect.breakChance }),
      ].join(' · ');
    case 'terrain':
      return [
        t('ability.detail.terrain', { rounds: effect.durationRounds }),
        t('ability.detail.radius', { radius: effect.radius }),
        t('ability.detail.difficultTerrain'),
      ].join(' · ');
    case 'revive':
      return t('ability.detail.revive');
  }
}

function option(unit: UnitState, definition: AbilityDefinition): AbilityOption {
  return {
    id: definition.id,
    name: abilityName(definition.id) ?? definition.id,
    cost: costLabel(unit, definition.cost),
    detail: detailOf(definition.effect),
    affordable: unit.ammo >= definition.cost,
  };
}

/**
 * The rows the menu shows for a unit: the abilities its own slots name, resolved in the match's own
 * catalog (ADR 0016 §3, §6). A slot naming an id the catalog does not define is left out: there is
 * nothing to draw a row from, and the aim would refuse it with `ability-unknown` anyway.
 */
export function abilityOptions(state: PublicState, unit: UnitState): AbilityOption[] {
  const options: AbilityOption[] = [];

  for (const id of offeredIds(unit)) {
    const definition = abilityById(state.catalog, id);
    if (definition !== undefined) options.push(option(unit, definition));
  }

  return options;
}
