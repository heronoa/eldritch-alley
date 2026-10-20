import { Migration } from '@mikro-orm/migrations';

/**
 * `contact_messages` and `release_subscriptions`, the two tables m4-05 writes.
 *
 * The contact table keeps the address as a truncated hash and never as the address itself; its
 * account reference is `set null`, so deleting an account leaves the support request the owner still
 * has to answer. The subscription table is one row per account, with the consent off in the column
 * as well as in the markup (D6), and a token that is created on the first opt-in and never changes.
 */
export class Migration20261017120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "contact_messages" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid null,
        "name" text not null,
        "email" text not null,
        "message" text not null,
        "ip_hash" text not null,
        "created_at" timestamptz not null default now(),
        constraint "contact_messages_pkey" primary key ("id"),
        constraint "contact_messages_user_id_foreign" foreign key ("user_id")
          references "users" ("id") on update cascade on delete set null
      );
    `);
    this.addSql(
      `create index "contact_messages_created_at_index" on "contact_messages" ("created_at");`,
    );

    this.addSql(`
      create table "release_subscriptions" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "email" text not null,
        "opted_in" boolean not null default false,
        "consented_at" timestamptz null,
        "unsubscribed_at" timestamptz null,
        "token" text not null,
        "locale" text not null default 'en-US',
        "created_at" timestamptz not null default now(),
        constraint "release_subscriptions_pkey" primary key ("id"),
        constraint "release_subscriptions_user_id_unique" unique ("user_id"),
        constraint "release_subscriptions_token_unique" unique ("token"),
        constraint "release_subscriptions_user_id_foreign" foreign key ("user_id")
          references "users" ("id") on update cascade on delete cascade
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "release_subscriptions" cascade;`);
    this.addSql(`drop table if exists "contact_messages" cascade;`);
  }
}
