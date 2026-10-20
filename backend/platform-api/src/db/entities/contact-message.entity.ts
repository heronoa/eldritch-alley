import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';
import { User } from './user.entity';

/**
 * One message sent through the contact form (m4-05). It is the one unauthenticated write in the
 * system, so it carries the proof the route checked rather than the fact that a route wrote it: the
 * address's hash, never the address, and the account when the sender happened to be signed in.
 *
 * `user_id` is `set null` and not `cascade`: deleting an account must not erase a support request the
 * owner still has to answer, and the message is the artifact.
 */
@Entity({ tableName: 'contact_messages' })
@Index({ name: 'contact_messages_created_at_index', properties: ['createdAt'] })
export class ContactMessage {
  [OptionalProps]?: 'createdAt' | 'user';

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  /** The signed-in sender, when there was one; a guest leaves this empty. */
  @ManyToOne(() => User, { deleteRule: 'set null', nullable: true })
  user: User | null = null;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text' })
  email!: string;

  @Property({ type: 'text' })
  message!: string;

  /** `sha256(ip + salt)`, truncated. The raw address never reaches this table or a log line. */
  @Property({ type: 'text' })
  ipHash!: string;

  @Property({ type: 'datetime', defaultRaw: 'now()', onCreate: () => new Date() })
  createdAt!: Date;
}
