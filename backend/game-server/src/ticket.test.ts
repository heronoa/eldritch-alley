// The ticket, from the side that can only check it. Both keys are generated per run, so no key in the
// repository is load bearing and nothing here depends on a file on disk — the same arrangement
// `platform-api/src/auth/game-ticket.test.ts` uses from the issuing side.
import { SignJWT, exportPKCS8, exportSPKI, generateKeyPair, importPKCS8 } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { GAME_TICKET_ISSUER, verifyTicket } from './ticket';

const USER_ID = '2d9a5c31-8b7e-4f6a-9c0d-1e2f3a4b5c6d';
const ALGORITHM = 'EdDSA';

let publicKey: string;
let privateKey: string;
let otherPrivateKey: string;

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  publicKey = await exportSPKI(pair.publicKey);
  privateKey = await exportPKCS8(pair.privateKey);

  const other = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  otherPrivateKey = await exportPKCS8(other.privateKey);
});

/**
 * A ticket built here rather than by `platform-api`'s issuer: importing the platform's signer into the
 * match server is the dependency this milestone exists to avoid, and what the two services share is the
 * claim set, not a module. The four claims below are the whole contract (ADR 0018 § 7).
 */
async function ticket(
  claims: { sub?: string; iss?: string; exp?: number } = {},
  signer = privateKey,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(claims.iss ?? GAME_TICKET_ISSUER)
    .setSubject(claims.sub ?? USER_ID)
    .setIssuedAt(issuedAt)
    .setExpirationTime(claims.exp ?? issuedAt + 300)
    .sign(await importPKCS8(signer, ALGORITHM));
}

describe('verifyTicket', () => {
  it('names the player a ticket the platform signed was issued for', async () => {
    const verified = await verifyTicket(await ticket(), publicKey);
    expect(verified).toEqual({ userId: USER_ID });
  });

  it('refuses a payload that was changed after it was signed', async () => {
    const original = await ticket();
    const [header, payload, signature] = original.split('.');

    // The same signature over somebody else's id: the classic "edit the token and hope" attempt. The
    // signature is over the payload, so swapping the id has to break it.
    const forged = Buffer.from(JSON.stringify({
      iss: GAME_TICKET_ISSUER,
      sub: 'someone-else',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    })).toString('base64url');

    expect(payload).not.toBe(forged);
    expect(await verifyTicket(`${header}.${forged}.${signature}`, publicKey)).toBeNull();
  });

  it('refuses a ticket signed by another key', async () => {
    const elsewhere = await ticket({}, otherPrivateKey);
    expect(await verifyTicket(elsewhere, publicKey)).toBeNull();
  });

  it('refuses an expired ticket and accepts one that is one second from expiry', async () => {
    const now = Math.floor(Date.now() / 1000);

    expect(await verifyTicket(await ticket({ exp: now - 1 }), publicKey)).toBeNull();
    expect(await verifyTicket(await ticket({ exp: now + 1 }), publicKey)).toEqual({ userId: USER_ID });
  });

  it('refuses a ticket another service issued', async () => {
    const elsewhere = await ticket({ iss: 'eldritch-alley/somebody-else' });
    expect(await verifyTicket(elsewhere, publicKey)).toBeNull();
  });

  it('refuses an empty, malformed or truncated token rather than throwing', async () => {
    const valid = await ticket();
    const [header, payload] = valid.split('.');

    // A join carries a string the player controls, so none of these is an exceptional event: each is
    // an ordinary "no" that leaves the player a guest.
    for (const bad of ['', 'not-a-ticket', `${header}.${payload}`, `${header}..`, '...', 'a.b.c.d']) {
      expect(await verifyTicket(bad, publicKey)).toBeNull();
    }
  });

  it('refuses a ticket with no subject to name', async () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const anonymous = await new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuer(GAME_TICKET_ISSUER)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 300)
      .sign(await importPKCS8(privateKey, ALGORITHM));

    expect(await verifyTicket(anonymous, publicKey)).toBeNull();
  });

  /**
   * The fail-safe. A private key handed in where the public one belongs is a misconfiguration, and the
   * answer to it is to verify nobody rather than to trust what the key seems to say. This is why the
   * reader is `importSPKI` and not something that guesses: a PKCS#8 document is not an SPKI one, so it
   * does not load at all.
   */
  it('refuses everything when the key it was handed is not a public key', async () => {
    expect(await verifyTicket(await ticket(), privateKey)).toBeNull();
    expect(await verifyTicket(await ticket(), '')).toBeNull();
    expect(await verifyTicket(await ticket(), 'not a pem')).toBeNull();
  });
});
