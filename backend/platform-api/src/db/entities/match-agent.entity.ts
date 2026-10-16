import { Entity, Index, ManyToOne, PrimaryKey } from '@mikro-orm/core';
import { Agent } from './agent.entity';
import { Match } from './match.entity';

/**
 * One unit that fought in a match, tying the match server's name for it to the squad row it is.
 *
 * `unit_id` is the match server's (`A-sniper`) and `agent_id` is this platform's, and the row exists
 * because neither side knows the other's identifier: the match server has never heard of an agent, and
 * the platform has never seen a unit id. What both know is the class, which is what the row is resolved
 * by (decision D9).
 *
 * The primary key is `(match_id, unit_id)` and not a surrogate: a unit fights in a match once, so a
 * second insert of the same pairing is a conflict the database settles rather than a duplicate row.
 */
@Entity({ tableName: 'match_agents' })
// A foreign key is not indexed by PostgreSQL on its own, and "the matches this agent fought in" is a
// question the agent's own screen will ask.
@Index({ name: 'match_agents_agent_id_index', properties: ['agent'] })
export class MatchAgent {
  @ManyToOne(() => Match, { primary: true, deleteRule: 'cascade' })
  match!: Match;

  /** The unit's name inside the match, which is also the name every event of that match uses. */
  @PrimaryKey({ type: 'text' })
  unitId!: string;

  @ManyToOne(() => Agent, { deleteRule: 'cascade' })
  agent!: Agent;
}
