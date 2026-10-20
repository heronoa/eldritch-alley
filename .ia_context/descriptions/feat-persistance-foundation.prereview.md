# Pre-review — A database for the platform, and the schema as a file in the repository (M4 · m4-01)

**Branch:** `feat/persistance-foundation`
**Generated on:** 2026-10-16

---

### 1. What to test

There is no route to click: this milestone is a database, a migration runner and a configuration read. Everything below is therefore a command run against a real PostgreSQL, and the integration cases in the suite are the proxy for the flows a later milestone will expose. Start with a scratch database, not the one you develop against — several of these steps create and drop tables:

```
docker run -d --name ea-check -e POSTGRES_USER=eldritch -e POSTGRES_PASSWORD=eldritch \
  -e POSTGRES_DB=eldritch_alley -p 55432:5432 postgres:17-alpine
export DATABASE_URL=postgres://eldritch:eldritch@localhost:55432/eldritch_alley
```

Run from the repository root unless a step says otherwise. Ordered from most critical to least.

**1. The drift guard — the thing this milestone exists for.** With the database empty, `npm run db:migrate` → `migrate: applied 1 migration`. Then `npm run db:migrate:check` → green, exit `0`, `No changes required, schema is up-to-date`. Now break it on purpose: in `backend/platform-api/src/db/entities/user.entity.ts`, change `displayName`'s `type: 'text'` to `type: 'string'` and run `npm run db:migrate:check` again. Expected: exit `1`, `Changes detected. Please create migration to update schema.` Revert the line, run it once more → green. **Then confirm the revert is byte-identical** (`git diff -- backend/platform-api/src/db/entities/user.entity.ts` is empty) — this is the step that catches a half-undone experiment, and it is the exact failure that was introduced and caught during implementation (plan D11).

**2. The migration is idempotent, and it holds the lock.** Against an empty database: `npm run db:migrate` → applied 1; a second run → `migrate: nothing to apply`, and `select name from mikro_orm_migrations` holds exactly one row. Then the case the deploy depends on — two processes at the same instant:

```
npm run db:migrate & npm run db:migrate; wait
```

Expected: both exit `0`, and **exactly one** prints `applied 1 migration` while the other prints `nothing to apply`. If both apply, or one fails on a duplicate-table error, the advisory lock is not doing its job. Confirm the migration table still holds one row.

**3. The schema is the one the spec describes, not an approximation of it.** `psql "$DATABASE_URL" -c '\d users'`. Expected: the seven columns of section 6 of [the spec](../inputs/m4-accounts-and-persistence.spec.md) — `id uuid` with a `gen_random_uuid()` default, `display_name text not null`, `email`/`avatar_url`/`privacy_version_seen` nullable `text`, `created_at timestamptz not null default now()`, `last_login_at timestamptz` nullable, primary key on `id`. **Watch for `character varying(255)`** where the migration says `text`: that is the drift the entity's explicit types prevent, and seeing it here would mean the entity was edited and the migration was not.

**4. A migration that fails leaves nothing behind.** This one is a test case and not a manual flow — `npm test -w @eldritch-alley/platform-api`, the case named *leaves nothing behind when a migration fails, and the next run still applies*. It runs a real process against a real database. Expected: after the throw, the table the failed migration created does not exist, the migration table is empty, and a run immediately after starts straight away, applies the real migration and exits `0` — proving the lock was released and nothing half-applied was left for the migrator to trip over.

**5. The suite still passes on a machine with nothing up.** Unset `DATABASE_URL` and run `npm test -w @eldritch-alley/platform-api`. Expected: **7 passed, 7 skipped**, with a printed line naming `npm run infra:up` — no failure, no hang. Then set it and run again: **14/14**. If the unset run fails instead of skipping, the gate in `src/db/test-database.ts` is wrong, and the repository has lost the property that the whole suite runs with nothing up (plan D5).

**6. A bad `DATABASE_URL` stops the process, and says what it found.** `DATABASE_URL=mysql://x npm run db:migrate` → exit `1`, a message naming `DATABASE_URL` and quoting the value. Repeat with the variable set to empty and to whitespace only — all three must fail, and none may fall back to a default. Then the API itself: `DATABASE_URL= npm run dev:platform-api` must **fail to finish booting** rather than come up and answer `/health`. That is the difference between a misconfigured deploy failing at start and one serving errors.

**7. Compose brings the schema up before the API.** `docker compose up --build postgres migrate platform-api` (this has not been run yet — see § 3). Expected: `migrate` runs to completion and exits `0` with the applied line; `platform-api` starts **only after** that; `curl localhost:3000/health` answers. Then `docker compose up` again: the migrate service reports nothing to apply and the API starts as before.

**8. Nothing else moved.** `npm run typecheck` clean; `npm run build` clean; `npm test` at the root green across the four workspaces. `find . -name '.snapshot-*' -not -path './node_modules/*'` → **empty**, and `ls backend/platform-api/src/migrations/` → one file. A snapshot file appearing there means `snapshot: false` was lost (plan D8), and it will reappear once per scratch database the suite creates.

---

### 2. Code checklist

- [ ] No `synchronize` option anywhere: `grep -rn "synchronize" backend/platform-api/src` hits **one line**, the comment in `src/db/orm.ts` that says it is never enabled. A second hit — an actual option — is the thing to look for, and its absence is the point of the milestone.
- [ ] `migrations.snapshot: false` is still in `src/db/orm.ts`, with its comment. Without it, every database the migrator touches gets a `.snapshot-<database>.json` written next to the migrations (D8).
- [ ] The entity and `Migration20261016120000` agree on **every** column type — `text` against `text`, `datetime` against `timestamptz`, and `defaultRaw: 'now()'` present on the entity's `created_at`. This is the pair `migrate:check` compares, and it passed on the last run.
- [ ] `[OptionalProps]?: 'createdAt'` is the only optional-props declaration, and `id` has none — a primary key with a default is optional on its own.
- [ ] `runMigrations` takes the lock on a `pg.Client` of **its own** (not through the ORM's pool), releases it in a `finally`, and the release cannot mask the error above it (`.catch(() => undefined)`). The ORM is closed in its own `finally`, so a failed `up()` does not leak the connection.
- [ ] `MIGRATION_LOCK_KEY` is used in both places rather than a literal `8170001`, and it is a constant rather than a hash of the database name.
- [ ] Nothing in the application imports the entry point. `grep -rn "from './migrate'\|from '../migrate'" backend/platform-api/src` has exactly one hit, and it is `src/db/database.module.test.ts` importing `runMigrations` — the function module, not `src/migrate.ts`. The entry point is reached only by `execFile` in `src/migrate.test.ts` and by the compose command, which is why it can call `process.exit`.
- [ ] `@types/pg` sits in `backend/platform-api/package.json`, **not** in the root `package.json` (it was installed into the wrong workspace once already).
- [ ] `backend/platform-api/tsconfig.json`'s `exclude` is exactly the siblings' line, `src/**/*.test.ts`, and hides no application file. `git diff develop...feat/persistance-foundation -- backend/platform-api/tsconfig.json` shows one added line.
- [ ] No credential **value** is added by the diff: `git diff develop...feat/persistance-foundation | grep -iE "^\+.*(secret|password)"` hits only variable *names* in the spec and the plans, the `.env.example` development default, and the compose file's `${POSTGRES_PASSWORD}`/`${JWT_SECRET}` interpolations, which resolve from the environment. Read the hits rather than trusting the count.
- [ ] No `console.log` outside the two lines `src/migrate.ts` prints on purpose (the applied count and nothing to apply), and no debug statement anywhere else in the diff.
- [ ] After `npm run build`, `dist/` holds `migrate.js`, `mikro-orm.config.js` and `migrations/Migration20261016120000.js` — the three paths the scripts and the compose service name.
- [ ] ADR 0019's nine decisions each match the code: MikroORM 6 (§1), no `synchronize` (§2), the process and the compose condition (§3), the lock's key and its own connection (§4), `transactional: true` (§5), additive-only migrations (§6), `snapshot: false` (§7).
- [ ] `m4-01-persistence.plan.md` §2 lists `src/db/migrate.ts`, `src/db/test-database.ts` and `src/mikro-orm.config.ts` as added while implementing, and D6–D12 match what the code does — including the two places the plan was wrong (`tsconfig.json` did change; the manager is a fork).
- [ ] Test counts at the head of the branch: platform-api **14/14** with a database and **7 passed / 7 skipped** without; engine 342; game-server 86; frontend 898.
- [ ] The branch's second commit message names only the `package.json` scripts while carrying the whole delivery — decide whether that message should be amended before the MR is opened, since it is what `git log` will show forever.

---

### 3. Behaviour checklist

- [ ] An empty database plus `npm run db:migrate` applies exactly one migration and prints `migrate: applied 1 migration`.
- [ ] Running it again prints `migrate: nothing to apply` and changes nothing.
- [ ] Two runs started at the same instant both exit `0`, one applies and the other applies nothing, and the migration table still holds one row.
- [ ] `users` exists with the columns and the types of the spec's section 6 — `text`, not `varchar(255)`.
- [ ] A migration that throws leaves no table and no migration row behind, and the next run applies normally.
- [ ] `npm run db:migrate:check` is green against the migrated schema, red when an entity's column type is changed on purpose, and green again after the revert.
- [ ] The API does not finish booting without a usable `DATABASE_URL`, and the migrate process exits `1` naming the variable when it is missing or is not a `postgres://` URL.
- [ ] `npm test` at the root is green with a database up, and the platform-api suite skips its integration cases (with a visible line) when `DATABASE_URL` is unset — never fails, never hangs.
- [ ] `npm run typecheck`, `npm run build` and `docker compose config --quiet` are all clean.
- [ ] **Not verifiable locally — check it on the pull request:** the CI job's PostgreSQL service comes up healthy, the **Migrate** step runs against a database that has never been migrated, and the **Check the migrations match the entities** step comes *after* it and is green. No Actions run has executed on this branch yet.
- [ ] **Also not run yet:** `docker compose up --build postgres migrate platform-api` end to end — the migrate service's exit code and the API's `service_completed_successfully` gate. Worth one run before the MR is opened, since it is the first thing the deploy will model.
