// The platform as the client uses it: one factory, one place that knows the base URL, the credentials
// mode and the error contract. Every screen asks for a method here and never calls `fetch` itself.
//
// The shapes are the platform's own (`backend/platform-api/src`), copied as the contract and checked at
// the boundary: a body that does not have them is an `unknown` failure, so a proxy's HTML page cannot
// arrive at a panel and be drawn as a row.
import { getLocale } from '../i18n/translate';
import { ApiError } from './errors';

/**
 * The providers the platform can have an OAuth app for. An allowlist and not an order: the buttons are
 * drawn in the order the platform answered, and a name outside this list draws no button.
 */
export const PROVIDER_NAMES = ['keycloak', 'github', 'google'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/** What every signed-in answer carries about the player. */
export interface Profile {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

/** One agent of the player's persistent squad, as `GET /me` lists it. */
export interface Agent {
  id: string;
  class: string;
  level: number;
  status: string;
}

/** The release-e-mail consent, as the profile reads it and as `PATCH` answers it. */
export interface ReleaseEmails {
  optedIn: boolean;
  consentedAt: string | null;
}

/** `GET /me`: the player, the squad in the order the platform sent them, and how the account signs in. */
export interface Account {
  user: Profile;
  agents: Agent[];
  /** Whether a usable password credential exists: the one fact the deletion card asks for. */
  hasPassword: boolean;
  /**
   * The release-e-mail consent. Absent on a platform that predates it — the profile reads that as off,
   * which is the safe side of a consent.
   */
  releaseEmails?: ReleaseEmails;
}

/** `POST /auth/game-ticket`. The service answers with a `Date`; JSON turns it into an ISO string. */
export interface GameTicket {
  ticket: string;
  expiresAt: string;
}

/** A finished match, from that player's side. */
export type MatchResult = 'won' | 'lost';

export interface MatchSummary {
  id: string;
  mapId: string;
  result: MatchResult;
  rounds: number;
  endedAt: string;
}

/** One page of the history, and where the next one starts — `null` on the last. */
export interface MatchPage {
  matches: MatchSummary[];
  nextCursor: string | null;
}

/** The one answer a route that must not say whether an address has an account gives. */
export interface Sent {
  status: 'sent';
}

/** `POST /auth/password/verify` also sets the session cookie. */
export interface Verified {
  verified: true;
}

/** `POST /auth/password/login`: the profile, and the cookie that goes with it. */
export interface LoginAnswer {
  user: Profile;
}

/** What the client can ask of the platform. */
export interface Api {
  /** Which OAuth providers this deployment has. A failure is an empty list, never an error. */
  providers(): Promise<readonly ProviderName[]>;
  /** `null` is the answer to a 401: nobody is signed in. It is not a failure. */
  me(): Promise<Account | null>;
  gameTicket(): Promise<GameTicket>;
  /** A 401 counts as success: the player is already signed out. */
  logout(): Promise<void>;
  /**
   * `DELETE /auth/account`. A 401 is a failure here, unlike `logout`: the caller must know whether the
   * account was deleted, and "already signed out" is an answer it has to say out loud.
   */
  deleteAccount(input: { confirm: string; password?: string }): Promise<void>;
  matches(cursor?: string): Promise<MatchPage>;
  /** `POST /contact`: a message to the owner, with the challenge token the widget produced. */
  contact(input: {
    name: string;
    email: string;
    message: string;
    turnstileToken: string;
    locale: string;
  }): Promise<void>;
  /** `PATCH /me/release-emails`: records the consent and answers the record it kept. */
  setReleaseEmails(optedIn: boolean): Promise<ReleaseEmails>;

  register(input: { email: string; password: string; displayName?: string }): Promise<Sent>;
  verify(token: string): Promise<Verified>;
  resend(email: string): Promise<Sent>;
  login(input: { email: string; password: string }): Promise<LoginAnswer>;
  forgot(email: string): Promise<Sent>;
  reset(input: { token: string; password: string }): Promise<void>;
}

/** How long a call may wait before it is treated as no answer. The ticket is the one that matters. */
export const REQUEST_TIMEOUT_MS = 8_000;

/** The base URL without its trailing slash, so a route is always joined the same way. */
export function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Where a provider button navigates. It is a page load and not a `fetch`: the platform answers with a
 * redirect to the provider, which a cross-origin request could not follow.
 *
 * The locale rides in the query because a navigation cannot set a header, and the platform mails the
 * player afterwards: the notice that a new way in was added has to be written in the language the
 * player was reading when they clicked.
 */
export function oauthStart(baseUrl: string, provider: string, locale: string): string {
  const url = new URL(`${normalizeBase(baseUrl)}/auth/${encodeURIComponent(provider)}`);
  url.searchParams.set('locale', locale);
  return url.href;
}

export function createApi(baseUrl: string, fetchImpl: typeof fetch = fetch): Api {
  const base = normalizeBase(baseUrl);

  async function request(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    const hasBody = init.body !== undefined;
    try {
      return await fetchImpl(`${base}${path}`, {
        method: init.method ?? 'GET',
        // The session cookie is the whole of the account: one call without this is a silent logout.
        credentials: 'include',
        // A mailed link puts its token in the page's URL; there is no reason to hand it to anyone else.
        referrerPolicy: 'no-referrer',
        // The platform writes its mail in the language the player reads in, and this header is the only
        // place a request can say which one that is. The choice lives in the browser, not on the account.
        headers: hasBody
          ? { 'content-type': 'application/json', accept: 'application/json', 'accept-language': getLocale() }
          : { accept: 'application/json', 'accept-language': getLocale() },
        body: hasBody ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError('offline', null, null, 'the platform did not answer');
    }
  }

  /** The error the platform sent, read once, into the one shape the screens know. */
  async function failure(response: Response): Promise<ApiError> {
    let code: string | null = null;
    let message = `the platform answered ${response.status}`;

    const body = record(await json(response));
    if (body !== null) {
      code = text(body['code']);
      message = text(body['message']) ?? message;
    }

    // A 5xx is not a refusal a screen acts on, and a 4xx with no `code` is not this platform's.
    const kind = response.status >= 500 || code === null ? 'unknown' : 'refused';
    return new ApiError(kind, response.status, code, message);
  }

  /** The body as JSON, or `unknown`: a body that does not parse is not this platform's either. */
  async function json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new ApiError('unknown', response.status, null, 'the platform answered with nothing readable');
    }
  }

  /** The body of a successful answer, parsed and checked as a record. */
  async function object(response: Response): Promise<Record<string, unknown>> {
    const body = record(await json(response));
    if (body === null) {
      throw new ApiError('unknown', response.status, null, 'the platform answered with the wrong shape');
    }
    return body;
  }

  async function profile(response: Response, value: unknown): Promise<Profile> {
    const found = record(value);
    const id = text(found?.['id']);
    const displayName = text(found?.['displayName']);
    if (found === null || id === null || displayName === null) {
      throw new ApiError('unknown', response.status, null, 'the platform answered without a profile');
    }

    return {
      id,
      displayName,
      email: text(found['email']),
      avatarUrl: text(found['avatarUrl']),
    };
  }

  return {
    async providers() {
      // The rule of the milestone: a deployment with no OAuth app draws no button, and a platform that
      // does not answer is a deployment with no OAuth app for this screen's purposes.
      try {
        const response = await request('/auth/providers');
        if (!response.ok) return [];

        const body = await object(response);
        const names = body['providers'];
        if (!Array.isArray(names)) return [];
        return names.filter((name): name is ProviderName => isProvider(name));
      } catch {
        return [];
      }
    },

    async me() {
      const response = await request('/me');
      if (response.status === 401) return null;
      if (!response.ok) throw await failure(response);

      const body = await object(response);
      const agents = body['agents'];
      if (!Array.isArray(agents)) {
        throw new ApiError('unknown', response.status, null, 'the platform answered without a squad');
      }

      const releaseEmails = releaseEmailsOf(body['releaseEmails']);

      return {
        user: await profile(response, body['user']),
        // A body without the boolean reads as "no password": the guess only decides whether the
        // deletion card asks for one, and the server refuses the word alone for an account that has one.
        hasPassword: body['hasPassword'] === true,
        ...(releaseEmails === undefined ? {} : { releaseEmails }),
        agents: agents.flatMap((agent) => {
          const found = record(agent);
          const id = text(found?.['id']);
          const agentClass = text(found?.['class']);
          const level = found?.['level'];
          const status = found?.['status'];
          if (id === null || agentClass === null || typeof level !== 'number' || typeof status !== 'string') {
            return [];
          }
          return [{ id, class: agentClass, level, status }];
        }),
      };
    },

    async gameTicket() {
      const response = await request('/auth/game-ticket', { method: 'POST' });
      if (!response.ok) throw await failure(response);

      const body = await object(response);
      const ticket = text(body['ticket']);
      const expiresAt = text(body['expiresAt']);
      if (ticket === null || expiresAt === null) {
        throw new ApiError('unknown', response.status, null, 'the platform answered without a ticket');
      }
      return { ticket, expiresAt };
    },

    async logout() {
      const response = await request('/auth/logout', { method: 'POST' });
      // Signed out already is the state the caller wanted.
      if (response.status === 401 || response.ok) return;
      throw await failure(response);
    },

    async deleteAccount(input) {
      const response = await request('/auth/account', { method: 'DELETE', body: input });
      // No body to read: the platform answers 204, and the deletion is the cookie being cleared.
      if (!response.ok) throw await failure(response);
    },

    async contact(input) {
      const response = await request('/contact', { method: 'POST', body: input });
      if (!response.ok) throw await failure(response);

      const body = await object(response);
      if (body['received'] !== true) {
        throw new ApiError('unknown', response.status, null, 'the platform did not take the message');
      }
    },

    async setReleaseEmails(optedIn) {
      const response = await request('/me/release-emails', { method: 'PATCH', body: { optedIn } });
      if (!response.ok) throw await failure(response);

      const answer = releaseEmailsOf(await object(response));
      if (answer === undefined) {
        throw new ApiError('unknown', response.status, null, 'the platform answered without the consent');
      }
      return answer;
    },

    async matches(cursor) {
      const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
      const response = await request(`/me/matches${query}`);
      if (!response.ok) throw await failure(response);

      const body = await object(response);
      const rows = body['matches'];
      if (!Array.isArray(rows)) {
        throw new ApiError('unknown', response.status, null, 'the platform answered without a history');
      }

      return {
        matches: rows.flatMap((row) => {
          const found = record(row);
          const id = text(found?.['id']);
          const mapId = text(found?.['mapId']);
          const result = found?.['result'];
          const rounds = found?.['rounds'];
          const endedAt = text(found?.['endedAt']);
          if (
            id === null ||
            mapId === null ||
            (result !== 'won' && result !== 'lost') ||
            typeof rounds !== 'number' ||
            endedAt === null
          ) {
            return [];
          }
          return [{ id, mapId, result, rounds, endedAt }];
        }),
        nextCursor: text(body['nextCursor']),
      };
    },

    async register(input) {
      const body = input.displayName === undefined ? { email: input.email, password: input.password } : input;
      const response = await request('/auth/password/register', { method: 'POST', body });
      return sent(response);
    },

    async verify(token) {
      const response = await request('/auth/password/verify', { method: 'POST', body: { token } });
      if (!response.ok) throw await failure(response);

      const body = await object(response);
      if (body['verified'] !== true) {
        throw new ApiError('unknown', response.status, null, 'the platform did not confirm the address');
      }
      return { verified: true };
    },

    async resend(email) {
      const response = await request('/auth/password/verify/resend', { method: 'POST', body: { email } });
      return sent(response);
    },

    async login(input) {
      const response = await request('/auth/password/login', { method: 'POST', body: input });
      if (!response.ok) throw await failure(response);

      const body = await object(response);
      return { user: await profile(response, body['user']) };
    },

    async forgot(email) {
      const response = await request('/auth/password/forgot', { method: 'POST', body: { email } });
      return sent(response);
    },

    async reset(input) {
      const response = await request('/auth/password/reset', { method: 'POST', body: input });
      if (!response.ok) throw await failure(response);
    },
  };

  /** The two routes whose answer is always the same sentence. */
  async function sent(response: Response): Promise<Sent> {
    if (!response.ok) throw await failure(response);

    const body = await object(response);
    if (body['status'] !== 'sent') {
      throw new ApiError('unknown', response.status, null, 'the platform did not take the request');
    }
    return { status: 'sent' };
  }
}

function isProvider(value: unknown): value is ProviderName {
  return typeof value === 'string' && (PROVIDER_NAMES as readonly string[]).includes(value);
}

/** The consent as the platform writes it, or `undefined` when the body does not carry one. */
function releaseEmailsOf(value: unknown): ReleaseEmails | undefined {
  const found = record(value);
  if (found === null || typeof found['optedIn'] !== 'boolean') return undefined;

  return { optedIn: found['optedIn'], consentedAt: text(found['consentedAt']) };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
