import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';
import { User } from './user.entity';

/** How the match went for the player who played it: read from their side, never from the board's. */
export type MatchResult = 'won' | 'lost';

/**
 * One finished match, as the player who played it saw it. The row is written once, when the match
 * server says the match is over, and never again.
 *
 * `id` is the match server's and not this table's: that is what makes a second delivery of the same
 * message a conflict instead of a duplicate, which is the guarantee (ADR 0019) rather than the queue's
 * deduplication window.
 *
 * A guest's match has no row here, and cannot: `user_id` is what a match is filed under, and a guest
 * has nobody to file it against. The events are kept because a replay is the point of the table, and
 * the setup that replay needs is rebuilt from `seed`, `map_id` and `protocol_version`.
 */
@Entity({ tableName: 'matches' })
// The history query is "this player's matches, newest first", and its page boundary is `(ended_at, id)`,
// which is why both are in the index: one index serves the filter, the order and the cursor.
@Index({ name: 'matches_user_id_ended_at_index', properties: ['user', 'endedAt', 'id'] })
export class Match {
  [OptionalProps]?: 'createdAt';

  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  /**
   * The seed the match was played on, and the whole of the board: the units, their classes and every
   * roll follow from it. `bigint` and not `integer` because the engine takes an unsigned 32-bit seed
   * (`UINT32_MAX`), and half of those do not fit in a signed 32-bit column.
   */
  @Property({ type: 'bigint', runtimeType: 'number' })
  seed!: number;

  @Property({ type: 'text' })
  mapId!: string;

  /** The payload shape the match was played under, so a replay can refuse one it cannot read. */
  @Property({ type: 'integer' })
  protocolVersion!: number;

  @Property({ type: 'text' })
  result!: MatchResult;

  @Property({ type: 'integer' })
  rounds!: number;

  /**
   * `hashState` of the final state, as the match server computed it (decision D4). The setup is
   * rebuilt from the code, so a change to the classes, the maps or the ability catalog can change what
   * an old match replays to — and with this stored, that shows up as a mismatch instead of passing
   * unnoticed. `bigint`, for the same reason as the seed: the hash is unsigned 32-bit too.
   */
  @Property({ type: 'bigint', runtimeType: 'number' })
  finalStateHash!: number;

  /** Both from the match server's clock, in the room that played the match. */
  @Property({ type: 'datetime' })
  startedAt!: Date;

  @Property({ type: 'datetime' })
  endedAt!: Date;

  /** When the platform got round to storing it, which is not `endedAt` when the queue is behind. */
  @Property({ type: 'datetime', defaultRaw: 'now()', onCreate: () => new Date() })
  createdAt!: Date;
}
