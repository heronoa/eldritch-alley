// Test support, not application code: the harness the route tests share. It starts the real
// `AppModule` — the real guard, the real controller, the real container — over a listening port, and
// the cases talk to it with `fetch`. Nothing is mocked except the two OAuth providers, which would
// otherwise need the network; the database is a scratch one, as in `src/db/test-database.ts`.

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { AppModule } from '../app.module';
import { configureApp } from '../app';
import { runMigrations } from '../db/migrate';
import { OAUTH_PROVIDERS, type OAuthProvider, type ProviderName } from './provider';

/** The origin the client would be served from, and the one CORS has to allow. */
export const CLIENT_ORIGIN = 'https://eldritch.test';
export const SESSION_COOKIE = 'ea_session';

export interface TestApp {
  url: string;
  close(): Promise<void>;
}

let keys: { privateKey: string; publicKey: string } | undefined;

/**
 * One key pair per test process, generated rather than committed. The public half is what a case
 * verifies the ticket with — the same thing the match server holds.
 */
export async function testTicketKeys(): Promise<{ privateKey: string; publicKey: string }> {
  if (keys === undefined) {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    keys = {
      privateKey: await exportPKCS8(pair.privateKey),
      publicKey: await exportSPKI(pair.publicKey),
    };
  }
  return keys;
}

/**
 * The environment a platform needs to come up. Every value is a test value: the only one that has to
 * be real is the database, which the case passes in — or does not, when the case is about a platform
 * that has to refuse to start without one.
 */
export async function setAuthEnvironment(databaseUrl: string | undefined): Promise<void> {
  const { privateKey } = await testTicketKeys();
  if (databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'a-test-session-secret-of-32-characters';
  process.env.COOKIE_DOMAIN = 'eldritch.test';
  process.env.CLIENT_ORIGIN = CLIENT_ORIGIN;
  process.env.OAUTH_REDIRECT_BASE_URL = 'https://api.eldritch.test';
  process.env.OAUTH_GITHUB_CLIENT_ID = 'github-client-id';
  process.env.OAUTH_GITHUB_CLIENT_SECRET = 'github-client-secret';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'google-client-id';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'google-client-secret';
  process.env.GAME_TICKET_PRIVATE_KEY = privateKey;
}

export async function startTestApp(options: {
  databaseUrl: string;
  providers?: Record<ProviderName, OAuthProvider>;
}): Promise<TestApp> {
  await setAuthEnvironment(options.databaseUrl);
  // The container does not create tables — the migrations do, and in production that is a step of its
  // own — so the scratch database is brought up to the schema the application expects before it starts.
  await runMigrations({ databaseUrl: options.databaseUrl });

  let builder: TestingModuleBuilder = Test.createTestingModule({ imports: [AppModule] });
  if (options.providers !== undefined) {
    builder = builder.overrideProvider(OAUTH_PROVIDERS).useValue(options.providers);
  }

  const moduleRef = await builder.compile();
  const app: INestApplication = configureApp(moduleRef.createNestApplication());
  await app.listen(0, '127.0.0.1');

  return {
    url: await app.getUrl(),
    close: () => app.close(),
  };
}

/** Every `Set-Cookie` the response carried, in order. */
export function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

/** The value of one cookie by name, or undefined when the response did not set it. */
export function cookieValue(cookies: string[], name: string): string | undefined {
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    const [key, ...rest] = pair.split('=');
    if (key.trim() === name) return rest.join('=');
  }
  return undefined;
}

/** The `Set-Cookie` values as one `Cookie` request header. */
export function asRequestCookie(cookies: string[]): string {
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

/**
 * The whole flow with a provider that needs no network: take the redirect, keep the cookies it set,
 * and follow it to the callback with the `state` it handed out.
 */
export async function signIn(
  appUrl: string,
  provider: ProviderName,
  code = 'the-authorization-code',
): Promise<{ response: Response; cookies: string[] }> {
  const start = await fetch(`${appUrl}/auth/${provider}`, { redirect: 'manual' });
  const cookies = setCookies(start);
  const location = new URL(start.headers.get('location') ?? '');

  const response = await fetch(
    `${appUrl}/auth/${provider}/callback?code=${code}&state=${location.searchParams.get('state')}`,
    { redirect: 'manual', headers: { cookie: asRequestCookie(cookies) } },
  );
  return { response, cookies };
}
