import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENTITY_MANAGER } from '../db/database.module';
import { Agent, type AgentClass } from '../db/entities/agent.entity';
import { MatchAgent } from '../db/entities/match-agent.entity';
import { MatchEvent } from '../db/entities/match-event.entity';
import { Match, type MatchResult } from '../db/entities/match.entity';
import { User } from '../db/entities/user.entity';
import type { MatchEndedMessage } from './match-ended';

/** How many matches a page of the history holds. */
export const PAGE_SIZE = 20;

/** One match as the history lists it: enough for a row, and not the events of a whole battle. */
export interface MatchSummary {
  id: string;
  mapId: string;
  result: MatchResult;
  rounds: number;
  endedAt: string;
}

export interface MatchHistory {
  matches: MatchSummary[];
  /** Where the next page starts, or null when this is the last one. */
  nextCursor: string | null;
}

/** Where a page starts: the last match of the page before it. */
export interface MatchCursor {
  endedAt: Date;
  id: string;
}

/**
 * The cursor as it travels. Opaque to the client and deliberately not signed: it carries a position and
 * never a player, and the query fixes the player from the session, so a cursor someone made up — or
 * borrowed from another account — can only ever ask for a page of the caller's own matches. A signature
 * would be a way of trusting the cursor, which is the shape an IDOR is made of.
 */
export function encodeCursor(cursor: MatchCursor): string {
  return Buffer.from(`${cursor.endedAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/**
 * The position inside a cursor, or null for anything that is not one. The id is checked for the shape of
 * a uuid rather than left to the database: `id < $1` on a uuid column with a string that is not a uuid is
 * an error, and a cursor somebody typed by hand must be a 400 and not a 500.
 */
export function decodeCursor(raw: string): MatchCursor | null {
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const separator = text.lastIndexOf('|');
  if (separator === -1) return null;

  const endedAt = new Date(text.slice(0, separator));
  const id = text.slice(separator + 1);
  if (Number.isNaN(endedAt.getTime()) || !UUID.test(id)) return null;

  return { endedAt, id };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Writes a finished match into the battle history. The only writer of `matches`, `match_agents` and
 * `match_events`, and the only place a queue message stops being a message.
 *
 * Delivery is at-least-once and this is written for it: the match server's id is the primary key, so a
 * message the queue hands over twice is a conflict the database settles. `store()` says which of the
 * two deliveries it was, and the second writes nothing at all — the agents and the events included,
 * because the second delivery returns before either is reached.
 */
@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(@Inject(ENTITY_MANAGER) private readonly em: EntityManager) {}

  /**
   * Stores one match, with the units that fought in it and its events. Returns true when this call was
   * the one that stored it, and false when it was already there.
   *
   * Throws rather than returning false when the message cannot be stored at all — an account this
   * platform does not have. The distinction is what keeps the queue honest: `false` means "done, this
   * was already handled" and lets the message be deleted, while a throw leaves it for a redelivery, so
   * a platform whose database is behind loses no matches.
   */
  async store(message: MatchEndedMessage): Promise<boolean> {
    return this.em.transactional(async (tx) => {
      // The player first, and by hand rather than by letting the foreign key complain: a match nobody
      // can be shown is a message to keep, and the error is worth naming the player the match server
      // sent. It also means the match id is never written against an account that is not there.
      const player = await tx.findOne(User, { id: message.userId }, { fields: ['id'] });
      if (player === null) {
        throw new Error(`match ${message.id} names player ${message.userId}, who has no account here`);
      }

      if (!(await this.insertMatch(tx, message))) return false;

      await this.insertAgents(tx, message);
      await this.insertEvents(tx, message);
      return true;
    });
  }

  /**
   * A page of one player's matches, newest first. The player is an argument and never a field of the
   * cursor, which is the whole of why a borrowed cursor is harmless.
   *
   * The order is `(ended_at desc, id desc)` and the page boundary is that same pair, so two matches that
   * ended in the same millisecond are neither repeated on the next page nor skipped between the two. The
   * `id` settles what `ended_at` cannot: the timestamp is the match server's own clock to the
   * millisecond (`toISOString`), so equality on it is exact for the rows this table holds.
   */
  async history(
    userId: string,
    cursor: MatchCursor | null,
    limit: number = PAGE_SIZE,
  ): Promise<MatchHistory> {
    const em = this.em.fork();

    const matches = await em.find(
      Match,
      {
        user: userId,
        ...(cursor === null
          ? {}
          : {
              $or: [
                { endedAt: { $lt: cursor.endedAt } },
                { endedAt: cursor.endedAt, id: { $lt: cursor.id } },
              ],
            }),
      },
      // One more than the page holds: whether there is another page is a question about the row after
      // this one, and asking it as a count would be a second query with a second answer.
      { orderBy: { endedAt: 'desc', id: 'desc' }, limit: limit + 1 },
    );

    const page = matches.slice(0, limit);
    const last = page.at(-1);

    return {
      matches: page.map((match) => ({
        id: match.id,
        mapId: match.mapId,
        result: match.result,
        rounds: match.rounds,
        endedAt: match.endedAt.toISOString(),
      })),
      nextCursor:
        matches.length > limit && last !== undefined
          ? encodeCursor({ endedAt: last.endedAt, id: last.id })
          : null,
    };
  }

  /**
   * The row the other two hang off, and the one that decides whether this delivery has anything to do.
   * `on conflict do nothing` and not a check-then-insert: two consumers, or one that was redelivered
   * while it was still working, would both find nothing and both insert, and only the database can
   * settle that. A conflict here means the match is already stored in full, which is why the caller
   * stops.
   */
  private async insertMatch(tx: EntityManager, message: MatchEndedMessage): Promise<boolean> {
    const inserted = await tx
      .createQueryBuilder(Match)
      .insert({
        id: message.id,
        user: message.userId,
        seed: message.seed,
        mapId: message.mapId,
        protocolVersion: message.protocolVersion,
        result: message.result,
        rounds: message.rounds,
        finalStateHash: message.finalStateHash,
        startedAt: new Date(message.startedAt),
        endedAt: new Date(message.endedAt),
      })
      .onConflict('id')
      .ignore()
      .returning('id')
      .execute('all');

    return inserted.length > 0;
  }

  /**
   * The units that fought, tied to the squad rows they are.
   *
   * The two sides have no identifier in common: the match server names a unit `A-sniper` and has never
   * heard of an agent, and this platform has never seen a unit id. The class is what both know, so the
   * class is what the row is resolved by (decision D9) — and a unit whose class the squad does not have
   * is logged and skipped, so that a squad the player changed, or a class that arrived afterwards,
   * costs the match one row rather than the whole history entry.
   */
  private async insertAgents(tx: EntityManager, message: MatchEndedMessage): Promise<void> {
    const squad = await tx.find(Agent, { user: message.userId }, { fields: ['id', 'class'] });
    const byClass = new Map<AgentClass, string>(squad.map((agent) => [agent.class, agent.id]));

    const rows = message.units.flatMap((unit) => {
      const agent = byClass.get(unit.class as AgentClass);
      if (agent === undefined) {
        this.logger.warn(
          `match ${message.id}: unit ${unit.unitId} played ${unit.class}, which player ${message.userId} has no agent for`,
        );
        return [];
      }
      return [{ match: message.id, unitId: unit.unitId, agent }];
    });

    if (rows.length === 0) return;
    await tx.createQueryBuilder(MatchAgent).insert(rows).onConflict(['match', 'unitId']).ignore().execute();
  }

  /**
   * The events, in the order they arrived, which is the order they are stored in: `seq` is the array
   * index and half of the primary key. Nothing here reads inside an event — the engine gives them
   * meaning, and the engine is on the other side of the queue.
   */
  private async insertEvents(tx: EntityManager, message: MatchEndedMessage): Promise<void> {
    if (message.events.length === 0) return;

    await tx
      .createQueryBuilder(MatchEvent)
      .insert(message.events.map((event, seq) => ({ match: message.id, seq, event })))
      .onConflict(['match', 'seq'])
      .ignore()
      .execute();
  }
}
