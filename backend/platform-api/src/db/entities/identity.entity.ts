import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { User } from './user.entity';

/**
 * The ways into an account. The column is text; this union is what the code holds.
 *
 * `password` is a way in like the other two and is deliberately not in `OAuthProviderName`: it is a row
 * in this table, and it is never a button on the title screen or an entry in `GET /auth/providers`
 * (ADR 0021).
 */
export type ProviderName = 'github' | 'google' | 'password';

/**
 * One way into an account: what a provider calls the player, and what it reported about them.
 *
 * `(provider, provider_user_id)` is unique and is the **only** key that decides which account a sign-in
 * belongs to (ADR 0018). The address here is a way *in*, never a way to *take over*: it links to another
 * account only when both sides reported it as verified.
 */
@Entity({ tableName: 'identities' })
// The pair is the key the linking rule turns on, so the database is what refuses a duplicate of it.
//
// It is also the whole of what the database enforces about addresses, and that is deliberate: "one
// address is verified for one account" is *not* a constraint this schema can carry. A per-user unique
// index over `lower(email) where email_verified` refuses the linked account that holds a verified GitHub
// identity and a verified Google one — the state the linking rule exists to produce — and a global one
// refuses it twice over. What actually holds the invariant is this pair, with the address as its second
// half for a password identity, plus the linking rule for the providers (ADR 0021).
@Unique({ properties: ['provider', 'providerUserId'] })
// The linking rule's lookup: an address, and only the verified ones. Declared rather than left to the
// migration, so that the entities and the SQL describe the same schema and the drift check stays quiet.
@Index({ name: 'identities_email_verified_index', properties: ['email', 'emailVerified'] })
@Index({ name: 'identities_user_id_index', properties: ['user'] })
export class Identity {
  [OptionalProps]?: 'createdAt' | 'email' | 'emailVerified';

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @Property({ type: 'text' })
  provider!: ProviderName;

  /** The provider's own identifier for the player — a GitHub numeric id, a Google `sub`. Never reused. */
  @Property({ type: 'text' })
  providerUserId!: string;

  /**
   * The address as the provider reported it, lowercased so that two spellings of one address compare
   * equal in the database. Null when the provider exposed none (GitHub hides a private address).
   */
  @Property({ type: 'text', nullable: true })
  email: string | null = null;

  /**
   * Whether the *provider* vouched for that address. Written as reported and never weakened: an
   * identity that was verified stays verified, whatever a later sign-in says.
   */
  @Property({ type: 'boolean', default: false })
  emailVerified = false;

  @Property({ type: 'datetime', defaultRaw: 'now()', onCreate: () => new Date() })
  createdAt!: Date;
}
