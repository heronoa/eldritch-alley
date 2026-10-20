import { Migration } from '@mikro-orm/migrations';

/**
 * `password_credentials` and `auth_tokens`.
 *
 * The two tables hang off `identities` rather than off `users`, and that is the decision this migration
 * carries (ADR 0021): a way in is an identity, and a password is what one kind of identity holds. It is
 * what makes "an account with a password and no identity" a state the schema cannot represent, and it
 * lets the `(provider, provider_user_id)` uniqueness m4-02 already has do the work of keeping one
 * password account per address — the address is that pair's second half.
 *
 * No index is added to `identities`: the "one address, one verified account" invariant the plan expected
 * to write here is not expressible while one account may hold two verified identities for one address,
 * which is what a linked GitHub-and-Google account is (`identity.entity.ts`, ADR 0021).
 */
export class Migration20261016160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "password_credentials" (
        "id" uuid not null default gen_random_uuid(),
        "identity_id" uuid not null,
        "password_hash" text not null,
        "updated_at" timestamptz not null default now(),
        constraint "password_credentials_pkey" primary key ("id"),
        constraint "password_credentials_identity_id_unique" unique ("identity_id"),
        constraint "password_credentials_identity_id_foreign" foreign key ("identity_id")
          references "identities" ("id") on update cascade on delete cascade
      );
    `);

    this.addSql(`
      create table "auth_tokens" (
        "id" uuid not null default gen_random_uuid(),
        "identity_id" uuid not null,
        "purpose" text not null,
        "token_hash" text not null,
        "expires_at" timestamptz not null,
        "consumed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        constraint "auth_tokens_pkey" primary key ("id"),
        constraint "auth_tokens_token_hash_unique" unique ("token_hash"),
        constraint "auth_tokens_identity_id_foreign" foreign key ("identity_id")
          references "identities" ("id") on update cascade on delete cascade
      );
    `);
    this.addSql(`create index "auth_tokens_identity_id_index" on "auth_tokens" ("identity_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "auth_tokens" cascade;`);
    this.addSql(`drop table if exists "password_credentials" cascade;`);
  }
}
