import { Migration } from '@mikro-orm/migrations';

/**
 * `users`, the table everything else in the schema hangs off. It is written by hand rather than
 * generated from a diff, and so is every migration after it: the SQL is what a reviewer reads.
 */
export class Migration20261016120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "users" (
        "id" uuid not null default gen_random_uuid(),
        "display_name" text not null,
        "email" text null,
        "avatar_url" text null,
        "privacy_version_seen" text null,
        "created_at" timestamptz not null default now(),
        "last_login_at" timestamptz null,
        constraint "users_pkey" primary key ("id")
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "users" cascade;`);
  }
}
