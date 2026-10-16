// Test support, not application code. The integration tests create tables, run migrations twice and
// drop things, and doing that to the database a developer is looking at would be rude — and would make
// two runs of the suite interfere with each other. Each call here makes a scratch database on the same
// server as DATABASE_URL, and the test drops it when it is done.

import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

/**
 * DATABASE_URL, or undefined when there is none — an unset variable and an empty one both mean "this
 * machine has no database", which is what skips the integration cases instead of failing them.
 */
export function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  return url === undefined || url === '' ? undefined : url;
}

export const hasDatabase = databaseUrl() !== undefined;

if (!hasDatabase) {
  console.warn(
    '[platform-api] DATABASE_URL is not set, so the migration and ORM integration tests are skipped. ' +
      '`npm run infra:up` starts a PostgreSQL on the documented port.',
  );
}

/** Creates a scratch database on DATABASE_URL's server and returns its connection string. */
export async function createScratchDatabase(): Promise<string> {
  const base = databaseUrl();
  if (base === undefined) throw new Error('createScratchDatabase() needs DATABASE_URL');

  const name = `ea_test_${randomBytes(5).toString('hex')}`;
  await withClient(adminUrl(base), (client) => client.query(`create database "${name}"`));

  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Drops a scratch database, ending whatever session the ORM's pool left behind. */
export async function dropScratchDatabase(url: string): Promise<void> {
  const name = new URL(url).pathname.slice(1);
  await withClient(adminUrl(url), (client) =>
    client.query(`drop database if exists "${name}" with (force)`),
  );
}

/** A single connection, closed whatever the callback does. */
export async function withClient<T>(
  connectionString: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** The server's maintenance database, which is where a create or drop database is issued from. */
function adminUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  return parsed.toString();
}
