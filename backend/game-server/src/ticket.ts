// Checking the ticket a player carries into a join — and only checking it. The match server holds the
// public half of the key pair and never the private one, so it can tell a ticket the platform issued
// from one it did not, and it has no way to issue one (ADR 0018 § 7, spec § Authentication).
import { importSPKI, jwtVerify, type CryptoKey } from 'jose';

/**
 * Who the ticket claims to come from. The platform sets this string when it signs, so it is part of the
 * contract between the two services and not a detail of this one.
 */
export const GAME_TICKET_ISSUER = 'eldritch-alley/platform-api';

const ALGORITHM = 'EdDSA';

export interface TicketClaims {
  /** The player the ticket was issued for — the platform's `users.id`. */
  userId: string;
}

/**
 * The player a ticket names, or nothing when it names nobody this server can vouch for.
 *
 * Every refusal is the same `null`, and none of them throws. A join carries a string the player
 * controls, so an empty token, a truncated one, one signed with another key and one past its five
 * minutes are all ordinary answers rather than exceptions — and the caller treats them all the same
 * way, by refusing the join and letting the player in as a guest.
 *
 * A key that is not a public key is the same answer again rather than a crash: a private PEM handed in
 * here, or an empty string, means this server can vouch for nobody, which is the safe direction to
 * fail in.
 */
export async function verifyTicket(token: string, publicKey: string): Promise<TicketClaims | null> {
  try {
    const { payload } = await jwtVerify(token, await keyOf(publicKey), {
      issuer: GAME_TICKET_ISSUER,
      algorithms: [ALGORITHM],
    });

    const userId = payload.sub;
    return typeof userId === 'string' && userId !== '' ? { userId } : null;
  } catch {
    return null;
  }
}

/**
 * The parsed key, kept for the life of the process: a key does not change while the server runs, and
 * parsing one is not work worth doing per join.
 */
let cached: { pem: string; key: CryptoKey } | undefined;

async function keyOf(pem: string): Promise<CryptoKey> {
  if (cached?.pem !== pem) {
    cached = { pem, key: await importSPKI(pem, ALGORITHM) };
  }
  return cached.key;
}
