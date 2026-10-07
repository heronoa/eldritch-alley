// The battle log: one short sentence per event.
//
// The sentences live in the catalog, under `log.event.*` and `log.rejection.*`, because they are
// read by a player and the player reads one language. The unit names are not translated: they are
// proper nouns of the setting (owner's decision, 2026-10-04).
import { t } from '../i18n';
import type { Event, Position, RejectReason, UnitId } from '../protocol';

/** Display name of each unit id. An id with no entry is shown as it is. */
export type UnitNames = Readonly<Record<UnitId, string>>;

function nameOf(names: UnitNames, id: UnitId): string {
  return names[id] ?? id;
}

function positionText(position: Position): string {
  return `(${position.x},${position.y})`;
}

/** A sentence describing one event, or the fallback when the client does not know the type. */
export function describeEvent(event: Event, names: UnitNames): string {
  switch (event.type) {
    case 'moved':
      return t('log.event.moved', {
        actor: nameOf(names, event.actor),
        from: positionText(event.from),
        to: positionText(event.to),
      });
    case 'attacked':
      if (!event.hit) return t('log.event.missed', { actor: nameOf(names, event.actor) });
      // Cover is the reason the shot was hard, so it is named on the sentence of the shot that landed.
      // A miss reads the same with or without it: the player already knows the shot did not land.
      return t(event.cover ? 'log.event.attackedCover' : 'log.event.attacked', {
        actor: nameOf(names, event.actor),
        target: nameOf(names, event.target),
        damage: event.damage,
      });
    case 'reloaded':
      // One action, two names: a magazine is reloaded, a pool of mana is meditated (ADR 0011). The
      // engine calls both a reload, so the player is told which one they asked for.
      return t(event.resource === 'mana' ? 'log.event.meditated' : 'log.event.reloaded', {
        actor: nameOf(names, event.actor),
      });
    case 'unit-defeated':
      return t('log.event.defeated', { target: nameOf(names, event.target) });
    case 'corpse-removed':
      return t('log.event.corpseRemoved', { target: nameOf(names, event.target) });
    case 'turn-ended':
      return t('log.event.turnEnded', { next: nameOf(names, event.next) });
    default:
      return t('log.event.unknown');
  }
}

/** The sentence shown when the server refuses an action, for every reason it can answer with. */
export function describeRejection(reason: RejectReason): string {
  switch (reason) {
    case 'not-your-turn':
    case 'out-of-bounds':
    case 'cell-occupied':
    case 'height-step-too-high':
    case 'no-path':
    case 'already-acted':
    case 'target-out-of-range':
    case 'no-line-of-sight':
    case 'target-invalid':
    case 'no-magazine':
    case 'no-ammunition':
    case 'no-mana':
    case 'magazine-full':
    case 'game-over':
    case 'stale-turn':
    case 'malformed-action':
    case 'no-pending-move':
      // The key is the code itself, so a new reason cannot arrive without its sentence.
      return t(`log.rejection.${reason}`);
    default:
      return t('log.rejection.unknown');
  }
}
