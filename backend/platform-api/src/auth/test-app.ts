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
import { MAILER, type EmailMessage, type Mailer } from '../email/mailer';
import { EMAIL_VARIABLES } from '../email/mailer-from-environment';
import { MatchEndedConsumer } from '../matches/match-ended.consumer';
import { InMemoryMatchEndedQueue, MATCH_ENDED_QUEUE, type MatchEndedQueue } from '../queue/queue';
import { OAUTH_PROVIDERS, type OAuthProvider, type ProviderName } from './provider';

/** The origin the client would be served from, and the one CORS has to allow. */
export const CLIENT_ORIGIN = 'https://eldritch.test';
export const SESSION_COOKIE = 'ea_session';

/**
 * Every variable that configures a provider, the redirect base included. A case that asks for a
 * platform with no provider configured has to have all five **deleted** and not merely left alone:
 * `process.env` outlives a case, so a value an earlier case set would be the value under test (§ 8).
 */
export const OAUTH_VARIABLES = [
  'OAUTH_REDIRECT_BASE_URL',
  'OAUTH_GITHUB_CLIENT_ID',
  'OAUTH_GITHUB_CLIENT_SECRET',
  'OAUTH_GOOGLE_CLIENT_ID',
  'OAUTH_GOOGLE_CLIENT_SECRET',
] as const;

export interface TestApp {
  url: string;
  /** Every message the platform "sent", in order. No case here touches the network. */
  mailer: FakeMailer;
  /**
   * One pass of the application's own consumer over the queue it was given. A case uses this instead of
   * waiting: the polling interval is set to an hour, so the only way a message is stored during a test is
   * because the case asked for it — which is the difference between a suite that is fast and a suite that
   * sleeps.
   */
  drain(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The mailer the route cases get. It records instead of sending, which is what keeps the suite off the
 * network and lets a case read the link out of the message the way a player would out of their mailbox.
 */
export class FakeMailer implements Mailer {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** The token carried by the link in the most recent message, or nothing when none was sent. */
  lastToken(): string | undefined {
    const last = this.sent.at(-1);
    if (last === undefined) return undefined;
    const link = /https?:\/\/\S+/.exec(last.text);
    return link === null ? undefined : (new URL(link[0]).searchParams.get('token') ?? undefined);
  }
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
export async function setAuthEnvironment(
  databaseUrl: string | undefined,
  options: { oauth?: boolean } = {},
): Promise<void> {
  const { privateKey } = await testTicketKeys();
  if (databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'a-test-session-secret-of-32-characters';
  process.env.COOKIE_DOMAIN = 'eldritch.test';
  process.env.CLIENT_ORIGIN = CLIENT_ORIGIN;
  process.env.GAME_TICKET_PRIVATE_KEY = privateKey;
  // Deleted rather than set, and deleted here rather than left to the case that set it: a case about a
  // bad lifetime writes this variable and only this one back, so without the delete the *next* case in
  // the file inherits the bad value. `process.env` outlives a case; the default is what a clean
  // environment means.
  delete process.env.GAME_TICKET_TTL_SECONDS;

  // The match queue is a value a test replaces, not a URL it reaches: the consumer's factory reads this
  // variable and builds a client it would then poll, so it is set to something that is never dialled —
  // and the interval is set to an hour, so that a container built by a case that only wanted to check a
  // secret does not start polling anything at all. A case that wants messages delivered to the platform
  // drains them itself (src/auth/test-app.ts's `queue`).
  process.env.MATCH_ENDED_QUEUE_URL = 'http://queue.invalid/000000000000/match-ended';
  process.env.MATCH_ENDED_POLL_INTERVAL_MS = '3600000';

  // No mail is configured in a test environment, and the mailer is replaced outright below. A case that
  // wants the choice between the two adapters makes it without a container (src/email/mailer.test.ts).
  for (const name of EMAIL_VARIABLES) delete process.env[name];

  // `oauth: false` is the platform a contributor clones: no provider configured, and it still comes up.
  if (options.oauth === false) {
    for (const name of OAUTH_VARIABLES) delete process.env[name];
  } else {
    process.env.OAUTH_REDIRECT_BASE_URL = 'https://api.eldritch.test';
    process.env.OAUTH_GITHUB_CLIENT_ID = 'github-client-id';
    process.env.OAUTH_GITHUB_CLIENT_SECRET = 'github-client-secret';
    process.env.OAUTH_GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'google-client-secret';
  }
}

export async function startTestApp(options: {
  databaseUrl: string;
  /** Partial, because a platform may be configured with one provider or with none (§ 8). */
  providers?: Partial<Record<ProviderName, OAuthProvider>>;
  /** `false` asks for a platform with none of the five OAuth variables in the environment. */
  oauth?: boolean;
  /**
   * The queue the consumer reads from. Absent means one of this harness's own, which is what a case that
   * only cares that a message *is* stored passes. The end-to-end case passes the object the match server
   * publishes into, so that one object is both halves of the conversation.
   */
  queue?: MatchEndedQueue;
}): Promise<TestApp> {
  await setAuthEnvironment(options.databaseUrl, { oauth: options.oauth });
  // The container does not create tables — the migrations do, and in production that is a step of its
  // own — so the scratch database is brought up to the schema the application expects before it starts.
  await runMigrations({ databaseUrl: options.databaseUrl });

  const mailer = new FakeMailer();
  const queue = options.queue ?? new InMemoryMatchEndedQueue();
  let builder: TestingModuleBuilder = Test.createTestingModule({ imports: [AppModule] })
    // Replaced always, and not only when a case asks: nothing in the suite may open a socket to a mail
    // server, and a case that forgot to ask must not be the one that tries.
    .overrideProvider(MAILER)
    .useValue(mailer)
    // And the same for the queue, for the same reason: a URL in the environment is not a queue, and a
    // consumer left reading one would be a test that fails when the network does.
    .overrideProvider(MATCH_ENDED_QUEUE)
    .useValue(queue);
  if (options.providers !== undefined) {
    builder = builder.overrideProvider(OAUTH_PROVIDERS).useValue(options.providers);
  }

  const moduleRef = await builder.compile();
  const app: INestApplication = configureApp(moduleRef.createNestApplication());
  await app.listen(0, '127.0.0.1');

  const consumer = moduleRef.get(MatchEndedConsumer);

  return {
    url: await app.getUrl(),
    mailer,
    drain: () => consumer.drain(),
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
