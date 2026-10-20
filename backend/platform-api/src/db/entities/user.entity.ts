import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';

/**
 * A player's account. Sign-in is the only thing that creates one (m4-02), and every other table in the
 * schema points at this row.
 */
@Entity({ tableName: 'users' })
export class User {
  /**
   * What a caller may leave out of `em.create`. `createdAt` is here and not in the column's own type:
   * the database fills it, and a reader of a loaded row still gets a `Date` rather than a `Date` that
   * might not be there. `id` needs no line — a primary key with a default is optional on its own.
   */
  [OptionalProps]?: 'createdAt';

  /** From the database's own `gen_random_uuid()`, so a row written outside the ORM is still complete. */
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  /** What the provider calls the player. Not unique: two accounts may share a name. */
  @Property({ type: 'text' })
  displayName!: string;

  /** GitHub does not expose an address when the account keeps it private, so this has no value there. */
  @Property({ type: 'text', nullable: true })
  email: string | null = null;

  @Property({ type: 'text', nullable: true })
  avatarUrl: string | null = null;

  /** The version of the privacy policy the player has been shown, written on every sign-in (m4-05). */
  @Property({ type: 'text', nullable: true })
  privacyVersionSeen: string | null = null;

  /**
   * `defaultRaw` and `onCreate` say the same thing twice on purpose, and both are needed: the column
   * default covers a row written outside the ORM, the hook covers the instance the ORM is holding — and
   * the entity without the default would have the CLI generating a migration to drop the column's.
   */
  @Property({ type: 'datetime', defaultRaw: 'now()', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'datetime', nullable: true })
  lastLoginAt: Date | null = null;
}
