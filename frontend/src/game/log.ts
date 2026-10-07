// The battle log: one short sentence per event.
//
// The sentences live in the catalog, under `log.event.*` and `log.rejection.*`, because they are
// read by a player and the player reads one language. The unit names are not translated: they are
// proper nouns of the setting (owner's decision, 2026-10-04).
import { coverFor } from '@eldritch-alley/engine';
import { t, type MessageKey } from '../i18n';
import type { Board, Event, Position, RejectReason, UnitId } from '../protocol';

/** Display name of each unit id. An id with no entry is shown as it is. */
export type UnitNames = Readonly<Record<UnitId, string>>;

/**
 * What an event needs beyond itself: the board it was played on, and where every unit stood when it
 * arrived. The scene has both and hands them in; an event read on its own carries no positions.
 */
export interface Battlefield {
  readonly board: Board;
  readonly positions: Readonly<Record<UnitId, Position>>;
}

function nameOf(names: UnitNames, id: UnitId): string {
  return names[id] ?? id;
}

function positionText(position: Position): string {
  return `(${position.x},${position.y})`;
}

/**
 * Whether the shooter threw the shot from behind cover. The engine answers for the target, because
 * that is what the shot costs; this is the same rule read from the other end (ADR 0012 § D4, ADR
 * 0013). Without a battlefield the answer is no, which is what every caller that has only the event
 * can say.
 */
function shotFromCover(actor: UnitId, target: UnitId, battlefield?: Battlefield): boolean {
  const from = battlefield?.positions[actor];
  const at = battlefield?.positions[target];
  if (battlefield === undefined || from === undefined || at === undefined) return false;

  return coverFor(battlefield.board, from, at);
}

/** The sentence of a shot: whether it landed, and which end of it stood behind cover. */
function attackSentence(
  event: Extract<Event, { type: 'attacked' }>,
  battlefield?: Battlefield,
): MessageKey {
  const fromCover = shotFromCover(event.actor, event.target, battlefield);
  const both = event.cover && fromCover;

  if (both) return event.hit ? 'log.event.attackedBothCover' : 'log.event.missedBothCover';
  if (event.cover) return event.hit ? 'log.event.attackedCover' : 'log.event.missedCover';
  if (fromCover) return event.hit ? 'log.event.attackedFromCover' : 'log.event.missedFromCover';

  return event.hit ? 'log.event.attacked' : 'log.event.missed';
}

/** A sentence describing one event, or the fallback when the client does not know the type. */
export function describeEvent(event: Event, names: UnitNames, battlefield?: Battlefield): string {
  switch (event.type) {
    case 'moved':
      return t('log.event.moved', {
        actor: nameOf(names, event.actor),
        from: positionText(event.from),
        to: positionText(event.to),
      });
    case 'attacked':
      // Cover is the reason the shot was hard, so it is named on both outcomes: the player has to know
      // why the shot missed, and what the one that landed was thrown through.
      return t(attackSentence(event, battlefield), {
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
    case 'regained':
      // The rule is one point of mana and nothing else (ADR 0017), so the sentence names the pool it
      // came from rather than reading it off the event.
      return t('log.event.regained', {
        actor: nameOf(names, event.actor),
        amount: event.amount,
      });
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
