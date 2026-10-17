import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { Identity } from './identity.entity';

/**
 * The two things a mailed link can do. They are not interchangeable and are never accepted for each
 * other: a reset link must not be able to verify an address, because the two are different amounts of
 * proof about the same mailbox (ADR 0021).
 */
export type AuthTokenPurpose = 'verify_email' | 'reset_password';

/**
 * One link that was mailed, and what is left of it. The row holds `sha256` of the token and never the
 * token itself — the same reasoning the spec applies to storing a hash of the contact form's address and
 * never the address — because a bearer credential for an account is worth stealing from a backup.
 *
 * Single use, expiring, and per purpose. Issuing a token spends whatever was live for the same identity
 * and purpose, so a mailbox with two links in it has one way in and not two.
 */
@Entity({ tableName: 'auth_tokens' })
// Every read is "the live tokens of this identity", and PostgreSQL does not index a foreign key.
@Index({ name: 'auth_tokens_identity_id_index', properties: ['identity'] })
export class AuthToken {
  [OptionalProps]?: 'consumedAt' | 'createdAt';

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Identity, { deleteRule: 'cascade' })
  identity!: Identity;

  @Property({ type: 'text' })
  purpose!: AuthTokenPurpose;

  /**
   * Unique, so that the lookup a link performs is a lookup of one row and so that a second token that
   * happened to hash the same way could not exist. The value itself is never stored.
   */
  @Unique()
  @Property({ type: 'text' })
  tokenHash!: string;

  @Property({ type: 'datetime' })
  expiresAt!: Date;

  /** When the link was followed. A time rather than a delete: a spent link is worth being able to see. */
  @Property({ type: 'datetime', nullable: true })
  consumedAt: Date | null = null;

  @Property({ type: 'datetime', defaultRaw: 'now()', onCreate: () => new Date() })
  createdAt!: Date;
}
