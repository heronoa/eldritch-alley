// What the ability menu shows (EA-16): the rows the `Habilidade` button opens before the aim does.
//
// It is pure and it reads the match's own catalog, so the content of the modal is tested without a
// browser and the scene that draws it decides nothing — the same split the unit sheet and the action
// bar are built on.
//
// Only the first active set is offered. It is the only slot the engine reads (ADR 0016 §6), and a row
// for a slot the server would answer with `ability-unknown` would be a button that never works. The
// rows are built from the slots and not from the class, so the day the engine reads a second set the
// menu grows with it and nothing else here changes.
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
 * The slots the menu offers: the unit's first active set, and nothing else. ADR 0016 §6 keeps the second
 * set, the reaction, the movement and the support slots unread, and the engine refuses a use its own
 * slots do not name — so offering one would be a row the server turns down.
 */
function offeredIds(unit: UnitState): readonly string[] {
  const id = unit.abilities.activeSets[0];
  return id === null ? [] : [id];
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
 * one rule the player has to read before aiming.
 */
function detailOf(effect: AbilityDefinition['effect']): string {
  // The second active set's three effects are menu rows only once the menu offers them (m4); until
  // then a row for one reads blank rather than carrying words it would have to invent.
  if (effect.kind !== 'damage' && effect.kind !== 'heal') return '';

  const parts = [
    effect.kind === 'heal'
      ? t('ability.detail.heal', { amount: effect.amount })
      : t('ability.detail.damage', { amount: effect.amount }),
  ];

  if (effect.radius > 0) parts.push(t('ability.detail.radius', { radius: effect.radius }));
  if (effect.kind === 'damage' && effect.ignoresCover) parts.push(t('ability.detail.ignoresCover'));
  if (effect.kind === 'damage' && effect.radius > 0) parts.push(t('ability.detail.hitsAllies'));

  return parts.join(' · ');
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
