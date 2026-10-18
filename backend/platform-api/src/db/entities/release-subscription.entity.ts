import { Entity, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';
import { User } from './user.entity';

/**
 * One account's consent to receive release e-mails (m4-05). The row exists only after the first
 * decision, and `optedIn` defaults to false in the column as well as in the markup: a page whose
 * script never runs cannot consent on anyone's behalf (D6).
 *
 * `consentedAt` records the latest yes and is kept when the player opts out — the consent happened,
 * and the record says when. `token` is created once and never changes, so the link in an old message
 * still works after an unsubscribe and a later opt-in.
 */
@Entity({ tableName: 'release_subscriptions' })
export class ReleaseSubscription {
  [OptionalProps]?: 'createdAt' | 'optedIn' | 'consentedAt' | 'unsubscribedAt' | 'locale';

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  /** One subscription per account; the database refuses a second row for the same player. */
  @OneToOne(() => User, { deleteRule: 'cascade', owner: true })
  user!: User;

  /** The address the release mail is sent to, copied from the account when the consent is recorded. */
  @Property({ type: 'text' })
  email!: string;

  @Property({ type: 'boolean', default: false })
  optedIn = false;

  @Property({ type: 'datetime', nullable: true })
  consentedAt: Date | null = null;

  @Property({ type: 'datetime', nullable: true })
  unsubscribedAt: Date | null = null;

  /** The secret the unsubscribe link carries; opaque, stable, and never the account's id. */
  @Property({ type: 'text', unique: true })
  token!: string;

  /** The language the message is written in, kept so the clicked link answers in that language. */
  @Property({ type: 'text', default: 'en-US' })
  locale = 'en-US';

  @Property({ type: 'datetime', defaultRaw: 'now()', onCreate: () => new Date() })
  createdAt!: Date;
}
