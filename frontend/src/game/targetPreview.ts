// EA-18: the odds behind an aim, read without rolling. `hitChanceFor` is already the engine's own
// pure, read-only rule — the one `resolveHit` itself consults — so this module adds no arithmetic of
// its own: it only decides which pair of units the question is asked about.
import { abilityCells, hitChanceFor } from '@eldritch-alley/engine';
import type { AbilityDefinition, PublicState, Position, UnitId, UnitState } from '../protocol';

/** The odds of a basic attack against this target, exactly what `resolveHit` would roll right now. A
 * basic attack never ignores cover, which is the same default `hitChanceFor` falls back to. */
export function attackChance(state: PublicState, attacker: UnitState, target: UnitState): number {
  return hitChanceFor(state, attacker, target);
}

/**
 * The odds against every living unit an armed ability would hit from `to`, keyed by unit id — the
 * caster included when it stands inside its own blast (ADR 0016 §12, the friendly-fire rule). Empty
 * for a heal effect, which never rolls (ADR 0016 §9): there is nothing to preview.
 */
export function abilityChances(
  state: PublicState,
  caster: UnitState,
  ability: AbilityDefinition,
  to: Position,
): ReadonlyMap<UnitId, number> {
  const chances = new Map<UnitId, number>();
  if (ability.effect.kind !== 'damage') return chances;

  const cells = abilityCells(state, to, ability);
  for (const unit of state.units) {
    if (unit.defeated || unit.permanentlyDead) continue;
    const inside = cells.some((cell) => cell.x === unit.position.x && cell.y === unit.position.y);
    if (!inside) continue;

    chances.set(unit.id, hitChanceFor(state, caster, unit, ability.effect.ignoresCover));
  }
  return chances;
}
