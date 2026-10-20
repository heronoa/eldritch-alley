// The shape of an action a client may send, checked before anything else sees it. Plain checks, no
// Phaser and no engine: the engine trusts its input, so the server has to answer for it.
import type { ClientAction } from './protocol';

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Whether `value` carries the two whole numbers a cell is made of. */
function isCell(value: unknown): value is { x: number; y: number } {
  if (typeof value !== 'object' || value === null) return false;
  const cell = value as Record<string, unknown>;
  return isWholeNumber(cell.x) && isWholeNumber(cell.y);
}

/** Whether `value` is one of the actions the protocol defines, with the fields it needs. */
export function isClientAction(value: unknown): value is ClientAction {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  switch (candidate.type) {
    case 'move':
      return isCell(candidate.to);
    case 'attack':
      return typeof candidate.target === 'string';
    case 'useAbility': {
      // The aim is a cell, the way a move's destination is: the engine refuses a cell off the board and
      // the shape only answers that the two numbers are there. `target` is optional, and absence is the
      // only spelling of "this cast names no unit": a null or a number is a malformed message, not an
      // omitted field (ADR 0023 §7).
      return (
        typeof candidate.abilityId === 'string' &&
        isCell(candidate.to) &&
        (candidate.target === undefined || typeof candidate.target === 'string')
      );
    }
    case 'reload':
      return true;
    // The two controls of a pending move carry no field at all, like `reload`: the run they act on
    // lives in the state the server holds (EA-5).
    case 'cancelMove':
    case 'commitMove':
      return true;
    case 'endTurn':
      // An action that names no round would be read as a stale one by the engine, so it is refused
      // here as malformed instead: the player gets the refusal that says what is actually wrong.
      return isWholeNumber(candidate.round);
    default:
      return false;
  }
}
