import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { Match } from './match.entity';

/**
 * One event of a match, in the order it happened. Nothing here updates or deletes a row: "append-only"
 * is a property of the store and not of the schema, and it holds because the only statement that ever
 * names this table is an insert. The rows are written in the same transaction as the match they belong
 * to, so a match whose events are half stored is not a state this table can be left in.
 *
 * The payload is stored as it arrived and is not read here. The platform holds the events; it is the
 * engine that gives them meaning, and the engine lives on the other side of this table — which is the
 * whole reason `final_state_hash` is stored beside them.
 *
 * `seq` rather than a timestamp: two events of one action can share a millisecond, and the order of the
 * events is the whole of what makes a replay a replay. `(match_id, seq)` is the primary key for the
 * same reason it is the ordering.
 */
@Entity({ tableName: 'match_events' })
export class MatchEvent {
  @ManyToOne(() => Match, { primary: true, deleteRule: 'cascade' })
  match!: Match;

  /** Zero-based, dense, and the match server's order. */
  @PrimaryKey({ type: 'integer' })
  seq!: number;

  /** An engine event, opaque here: this platform stores it, hands it back, and never looks inside. */
  @Property({ type: 'json' })
  event!: Record<string, unknown>;
}
