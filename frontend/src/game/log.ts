// The battle log: one short sentence per event.
//
// These sentences are Portuguese, unlike the rest of the repository, because they are read by a
// player. Change the language here and nowhere else.
import type { Event, Position, UnitId } from '../protocol';

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
      return `${nameOf(names, event.actor)} moveu de ${positionText(event.from)} para ${positionText(event.to)}`;
    case 'attacked':
      return event.hit
        ? `${nameOf(names, event.actor)} acertou ${nameOf(names, event.target)} por ${event.damage}`
        : `${nameOf(names, event.actor)} errou`;
    case 'reloaded':
      return `${nameOf(names, event.actor)} recarregou`;
    case 'unit-defeated':
      return `${nameOf(names, event.target)} caiu`;
    case 'corpse-removed':
      return `Corpo de ${nameOf(names, event.target)} removido`;
    case 'turn-ended':
      return `Vez de ${nameOf(names, event.next)}`;
    default:
      return 'evento desconhecido';
  }
}
