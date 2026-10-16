import { SignJWT, importPKCS8, type CryptoKey } from 'jose';
import { readGameTicketTtl, readRequired } from '../config';

/**
 * Who the ticket claims to come from. The match server checks this string, so it is part of the contract
 * between the two services and not a detail of this one (ADR 0018).
 */
export const GAME_TICKET_ISSUER = 'eldritch-alley/platform-api';

/**
 * Five minutes, as the spec asks, and the value used when `GAME_TICKET_TTL_SECONDS` says nothing. Named
 * apart from the variable so that a reader cannot confuse the fallback with what the environment set.
 */
export const DEFAULT_GAME_TICKET_TTL_SECONDS = 300;

const ALGORITHM = 'EdDSA';

export interface GameTicketConfig {
  /** A PKCS#8 Ed25519 private key, PEM, from the environment and never from the repository. */
  privateKey: string;
  ttlSeconds: number;
}

export interface GameTicket {
  ticket: string;
  expiresAt: Date;
}

export const GAME_TICKET_CONFIG = 'GAME_TICKET_CONFIG';

export function gameTicketConfigFromEnvironment(): GameTicketConfig {
  return {
    privateKey: readRequired(privateKeyFromEnvironment(), 'GAME_TICKET_PRIVATE_KEY'),
    ttlSeconds: readGameTicketTtl(process.env.GAME_TICKET_TTL_SECONDS),
  };
}

/**
 * A PEM in an environment variable arrives with its line breaks escaped, because a value cannot hold a
 * newline in an env file or in a `docker run -e`. The readers disagree about undoing that: `docker
 * compose` turns `\n` inside a quoted value into a real newline, and node's `--env-file`, which
 * `npm run dev` uses, leaves the two characters alone. A key contains no backslash, so the two
 * spellings are made one here rather than in every developer's shell.
 */
function privateKeyFromEnvironment(): string | undefined {
  const pem = process.env.GAME_TICKET_PRIVATE_KEY;
  return pem === undefined ? undefined : pem.replace(/\\n/g, '\n');
}

/**
 * A ticket for one player: a compact JWS the match server can verify with the public key alone. The
 * claims are the smallest set that identifies a player — no name, no address, no squad — because the
 * ticket travels through the client and through a socket the player controls.
 */
export async function issueGameTicket(
  userId: string,
  config: { privateKey: string; ttlSeconds?: number },
): Promise<GameTicket> {
  const ttlSeconds = config.ttlSeconds ?? DEFAULT_GAME_TICKET_TTL_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;

  const ticket = await new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(GAME_TICKET_ISSUER)
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(await privateKeyOf(config.privateKey));

  return { ticket, expiresAt: new Date(expiresAt * 1000) };
}

/**
 * The parsed key, kept for the life of the process: a key does not change while the service runs, and
 * parsing one is not work worth doing per request.
 */
let cached: { pem: string; key: CryptoKey } | undefined;

async function privateKeyOf(pem: string): Promise<CryptoKey> {
  if (cached?.pem !== pem) {
    cached = { pem, key: await importPKCS8(pem, ALGORITHM) };
  }
  return cached.key;
}
