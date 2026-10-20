import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { GAME_TICKET_ISSUER, issueGameTicket } from './game-ticket';

// The match server holds the public key and nothing else: it can verify a ticket and can never issue
// one (spec, Authentication). Both keys are generated per run, so no key in the repository is load
// bearing and nothing here depends on a file on disk.
const USER_ID = '2d9a5c31-8b7e-4f6a-9c0d-1e2f3a4b5c6d';
const TTL = 300;

let privateKey: string;
let publicKey: string;
let otherPrivateKey: string;

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  privateKey = await exportPKCS8(pair.privateKey);
  publicKey = await exportSPKI(pair.publicKey);

  const other = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  otherPrivateKey = await exportPKCS8(other.privateKey);
});

describe('the game ticket', () => {
  it('verifies with the public key and names the issuer, the player and the two times', async () => {
    const { ticket, expiresAt } = await issueGameTicket(USER_ID, { privateKey, ttlSeconds: TTL });

    const { payload, protectedHeader } = await jwtVerify(ticket, await importSPKI(publicKey, 'EdDSA'));
    expect(protectedHeader.alg).toBe('EdDSA');
    expect(payload.iss).toBe(GAME_TICKET_ISSUER);
    expect(payload.sub).toBe(USER_ID);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(expiresAt.getTime()).toBe(payload.exp! * 1000);
  });

  it('lasts exactly the configured number of seconds, five minutes by default', async () => {
    const explicit = await issueGameTicket(USER_ID, { privateKey, ttlSeconds: TTL });
    const { payload } = await jwtVerify(explicit.ticket, await importSPKI(publicKey, 'EdDSA'));
    expect(payload.exp! - payload.iat!).toBe(TTL);
    expect(explicit.expiresAt.getTime() - Date.now()).toBeGreaterThan(TTL * 1000 - 30_000);

    const byDefault = await issueGameTicket(USER_ID, { privateKey });
    const defaulted = await jwtVerify(byDefault.ticket, await importSPKI(publicKey, 'EdDSA'));
    expect(defaulted.payload.exp! - defaulted.payload.iat!).toBe(300);
  });

  it('is refused by the public key of another pair', async () => {
    const { ticket } = await issueGameTicket(USER_ID, { privateKey: otherPrivateKey, ttlSeconds: TTL });

    await expect(jwtVerify(ticket, await importSPKI(publicKey, 'EdDSA'))).rejects.toThrow();
  });
});
