import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';
import { User } from './user.entity';

/** The three classes a player starts with. The engine owns the numbers; the platform owns the roster. */
export type AgentClass = 'sniper' | 'wizard' | 'priest';

/**
 * `active` fights, `dead` has died this campaign, `retired` was put away by the player. Only `active`
 * is written by this milestone; the other two arrive with the campaign (ADR 0020).
 */
export type AgentStatus = 'active' | 'dead' | 'retired';

/**
 * One unit in a player's squad. The row exists so that a match can name the units that fought in it
 * (`match_agents`, m4-03) and so that a squad survives a browser.
 */
@Entity({ tableName: 'agents' })
// Every read of a squad is "the agents of this user", and PostgreSQL does not index a foreign key on
// its own.
@Index({ name: 'agents_user_id_index', properties: ['user'] })
export class Agent {
  [OptionalProps]?: 'createdAt' | 'level' | 'status';

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @Property({ type: 'text' })
  class!: AgentClass;

  @Property({ type: 'integer', default: 1 })
  level = 1;

  @Property({ type: 'text', default: 'active' })
  status: AgentStatus = 'active';

  @Property({ type: 'datetime', defaultRaw: 'now()', onCreate: () => new Date() })
  createdAt!: Date;
}
