import { Migration } from '@mikro-orm/migrations';

/**
 * `identities` and `agents`, the two tables m4-02 writes.
 *
 * `identities` carries the unique pair the linking rule turns on — `(provider, provider_user_id)` — and
 * the address index the rule looks a new sign-in up by. `agents` carries the starter squad, with the
 * spec's defaults on the row rather than in the code that inserts it.
 */
export class Migration20261016140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "identities" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "provider" text not null,
        "provider_user_id" text not null,
        "email" text null,
        "email_verified" boolean not null default false,
        "created_at" timestamptz not null default now(),
        constraint "identities_pkey" primary key ("id"),
        constraint "identities_provider_provider_user_id_unique" unique ("provider", "provider_user_id"),
        constraint "identities_user_id_foreign" foreign key ("user_id") references "users" ("id")
          on update cascade on delete cascade
      );
    `);
    this.addSql(
      `create index "identities_email_verified_index" on "identities" ("email", "email_verified");`,
    );
    this.addSql(`create index "identities_user_id_index" on "identities" ("user_id");`);

    this.addSql(`
      create table "agents" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "class" text not null,
        "level" int not null default 1,
        "status" text not null default 'active',
        "created_at" timestamptz not null default now(),
        constraint "agents_pkey" primary key ("id"),
        constraint "agents_user_id_foreign" foreign key ("user_id") references "users" ("id")
          on update cascade on delete cascade
      );
    `);
    this.addSql(`create index "agents_user_id_index" on "agents" ("user_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "agents" cascade;`);
    this.addSql(`drop table if exists "identities" cascade;`);
  }
}
