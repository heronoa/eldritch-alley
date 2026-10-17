import { SignJWT, jwtVerify } from 'jose';
import { readRequired } from '../config';

/**
 * The two cookies this platform sets, and their flags in one place. Both are signed with the same
 * secret and neither carries anything a reader could not be told: the value is the point, and the
 * signature is what makes it unforgeable.
 */
export const SESSION_COOKIE_NAME = 'ea_session';
export const FLOW_COOKIE_NAME = 'ea_oauth';

/** Thirty days. Long enough that a player is not asked to sign in again every week. */
export const SESSION_MAX_AGE_SECONDS = 2_592_000;

/** Ten minutes to walk from the platform to the provider and back. */
export const FLOW_MAX_AGE_SECONDS = 600;

/** Everything the cookie helpers need from the environment, gathered once while the container starts. */
export interface SessionConfig {
  secret: string;
  cookieDomain: string;
  clientOrigin: string;
  maxAgeSeconds: number;
}

export interface SessionPayload {
  userId: string;
  /** A new value per sign-in. Nothing is stored against it yet; it is what a server-side revocation would name. */
  sessionId: string;
  /** Milliseconds since the epoch, as signed. The cookie's age is checked against it, not against `exp`. */
  issuedAt: number;
}

/** What the browser carries between the redirect and the callback: the flow's own two secrets. */
export interface FlowPayload {
  provider: string;
  state: string;
  codeVerifier: string;
}

export const SESSION_CONFIG = 'SESSION_CONFIG';

/** The session configuration, read while the container is being built so a missing secret stops the boot. */
export function sessionConfigFromEnvironment(): SessionConfig {
  return {
    secret: readRequired(process.env.SESSION_SECRET, 'SESSION_SECRET'),
    cookieDomain: readRequired(process.env.COOKIE_DOMAIN, 'COOKIE_DOMAIN'),
    clientOrigin: readRequired(process.env.CLIENT_ORIGIN, 'CLIENT_ORIGIN'),
    maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
  };
}

const ALGORITHM = 'HS256';

export async function signSession(payload: SessionPayload, config: SessionConfig): Promise<string> {
  return new SignJWT({ sid: payload.sessionId, issuedAt: payload.issuedAt })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(payload.userId)
    .sign(secretKey(config));
}

/**
 * The payload behind a session value, or `null` for anything that cannot be trusted: a value signed with
 * another secret, one that was edited, one that is older than the configured age, and one that is not a
 * signed value at all. The caller has nothing to check afterwards.
 */
export async function readSession(
  value: string,
  config: SessionConfig,
): Promise<SessionPayload | null> {
  const claims = await readClaims(value, config, config.maxAgeSeconds);
  if (claims === null || typeof claims.sub !== 'string') return null;
  if (typeof claims.sid !== 'string' || typeof claims.issuedAt !== 'number') return null;

  return { userId: claims.sub, sessionId: claims.sid, issuedAt: claims.issuedAt };
}

export function sessionCookie(value: string, config: SessionConfig): string {
  return cookie(SESSION_COOKIE_NAME, value, config, config.maxAgeSeconds);
}

/** An empty value that expires now: the browser drops it, and `readSession` refuses what is left. */
export function clearSessionCookie(config: SessionConfig): string {
  return cookie(SESSION_COOKIE_NAME, '', config, 0);
}

export async function signFlow(flow: FlowPayload, config: SessionConfig): Promise<string> {
  return new SignJWT({
    provider: flow.provider,
    state: flow.state,
    codeVerifier: flow.codeVerifier,
    issuedAt: Date.now(),
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .sign(secretKey(config));
}

/** The flow behind a cookie value, or `null` when it is missing, edited, stale or foreign. */
export async function readFlow(value: string, config: SessionConfig): Promise<FlowPayload | null> {
  const claims = await readClaims(value, config, FLOW_MAX_AGE_SECONDS);
  if (claims === null) return null;
  if (
    typeof claims.provider !== 'string' ||
    typeof claims.state !== 'string' ||
    typeof claims.codeVerifier !== 'string'
  ) {
    return null;
  }

  return { provider: claims.provider, state: claims.state, codeVerifier: claims.codeVerifier };
}

export function flowCookie(value: string, config: SessionConfig): string {
  return cookie(FLOW_COOKIE_NAME, value, config, FLOW_MAX_AGE_SECONDS);
}

/**
 * The `Set-Cookie` header for one of the two. `Secure` is dropped for a loopback origin and for nothing
 * else, so the local flow runs over plain HTTP while no deployment that is reachable from anywhere else
 * can ship without it — the rule reads the origin, never `NODE_ENV`, which a host is free to leave unset.
 */
function cookie(name: string, value: string, config: SessionConfig, maxAgeSeconds: number): string {
  const attributes = ['Path=/', `Domain=${config.cookieDomain}`, 'HttpOnly', 'SameSite=Lax'];
  if (!isLoopback(config.clientOrigin)) attributes.push('Secure');
  attributes.push(`Max-Age=${maxAgeSeconds}`);

  return `${name}=${value}; ${attributes.join('; ')}`;
}

function isLoopback(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    // A value that is not a URL is not a loopback origin either, so the cookie keeps `Secure`.
    return false;
  }
}

async function readClaims(
  value: string,
  config: SessionConfig,
  maxAgeSeconds: number,
): Promise<Record<string, unknown> | null> {
  if (value === '') return null;

  try {
    const { payload } = await jwtVerify(value, secretKey(config), { algorithms: [ALGORITHM] });
    // The age is this service's own rule and not the token's `exp`: the payload says when it was issued,
    // and how long that stays good for is configuration.
    if (typeof payload.issuedAt === 'number' && Date.now() - payload.issuedAt > maxAgeSeconds * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function secretKey(config: SessionConfig): Uint8Array {
  return new TextEncoder().encode(config.secret);
}
