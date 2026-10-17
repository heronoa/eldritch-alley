// What the match server publishes when a match is over, as this side reads it. The shape is declared
// here rather than imported from `backend/game-server`: the two services share a queue and a contract,
// not a module, and a type imported across a deploy boundary would only pretend otherwise.
import type { MatchResult } from '../db/entities/match.entity';

/** One unit the player took into the match, named by the class it played. */
export interface MatchEndedUnit {
  unitId: string;
  class: string;
}

export interface MatchEndedMessage {
  /** The match server's own id, and the primary key this platform stores the match under. */
  id: string;
  userId: string;
  /** Unsigned 32-bit. */
  seed: number;
  mapId: string;
  protocolVersion: number;
  units: MatchEndedUnit[];
  result: MatchResult;
  rounds: number;
  /** ISO 8601, from the room's clock. */
  startedAt: string;
  endedAt: string;
  /** Unsigned 32-bit; `hashState` of the final state, as the match server computed it. */
  finalStateHash: number;
  /** The engine's events, opaque here. */
  events: Record<string, unknown>[];
}

/**
 * The message inside a queue body, or nothing when the body is not one.
 *
 * Nothing means "this will never be a message", which is what the consumer acts on: a body that does
 * not parse, or that parses into something else, is deleted and logged rather than retried forever.
 * That is why every field the store writes is checked here and `winner` is not — the platform never
 * reads it, and refusing a message over a field it would have ignored is a way to lose matches.
 */
export function readMatchEnded(body: string): MatchEndedMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;

  const { id, userId, seed, mapId, protocolVersion, units, result, rounds } = parsed;
  const { startedAt, endedAt, finalStateHash, events } = parsed;

  if (!isFilled(id) || !isFilled(userId) || !isFilled(mapId)) return null;
  if (!isUnsigned32(seed) || !isUnsigned32(finalStateHash)) return null;
  if (!isCount(protocolVersion) || !isCount(rounds)) return null;
  if (result !== 'won' && result !== 'lost') return null;
  if (!isMoment(startedAt) || !isMoment(endedAt)) return null;
  if (!isUnitList(units) || !isEventList(events)) return null;

  return {
    id,
    userId,
    seed,
    mapId,
    protocolVersion,
    units,
    result,
    rounds,
    startedAt,
    endedAt,
    finalStateHash,
    events,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** The engine's own bound: `UINT32_MAX`. Anything else is not a seed it could ever have played. */
function isUnsigned32(value: unknown): value is number {
  return isCount(value) && value <= 0xffff_ffff;
}

function isMoment(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isUnitList(value: unknown): value is MatchEndedUnit[] {
  return (
    Array.isArray(value) &&
    value.every((unit) => isObject(unit) && isFilled(unit.unitId) && isFilled(unit.class))
  );
}

function isEventList(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isObject);
}
