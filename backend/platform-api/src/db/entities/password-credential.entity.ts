import { Entity, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';
import { Identity } from './identity.entity';

/**
 * The secret behind one way in. It hangs off the identity and not off the account (ADR 0021): `identities`
 * is "the ways into an account" and this is what one of those ways holds, so "an account with a password
 * and no identity" is not a state the schema can represent, and the uniqueness of `(provider,
 * provider_user_id)` — which the linking rule turns on — is what keeps one password account per address.
 *
 * One row per identity: a password identity has exactly one password at a time, and choosing a new one
 * overwrites the row rather than adding a second that a reader could pick up by mistake.
 */
@Entity({ tableName: 'password_credentials' })
export class PasswordCredential {
  [OptionalProps]?: 'updatedAt';

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @OneToOne(() => Identity, { owner: true, deleteRule: 'cascade' })
  identity!: Identity;

  /**
   * The scrypt value — parameters, salt and key (`password.ts`). Never the password, and never a bare
   * digest: the parameters are what let a row written under yesterday's work factor keep verifying after
   * today's is raised.
   */
  @Property({ type: 'text' })
  passwordHash!: string;

  /**
   * When the password was last chosen. Worth a column: it is the only record a change leaves, and it is
   * what a player asking "when was this changed?" would be told.
   */
  @Property({ type: 'datetime', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date;
}
