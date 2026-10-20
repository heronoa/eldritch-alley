import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRYPT_PARAMETERS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
} from './password';

// The cheapest parameters that exist, for the cases that are about the *shape* of a stored password and
// not about its cost. The production parameters are what the module's own default is, and the last case
// here is the one that proves a stored value carries the parameters it was written with.
const CHEAP = { cost: 1 << 10, blockSize: 8, parallelization: 1 };

describe('hashPassword', () => {
  it('gives two different stored values for the same password, because the salt is per hash', async () => {
    const [first, second] = await Promise.all([
      hashPassword('correct horse battery staple', CHEAP),
      hashPassword('correct horse battery staple', CHEAP),
    ]);

    expect(first).not.toBe(second);
  });

  it('writes the parameters it used into the stored value', async () => {
    // Without them a change to the cost would lock every player out: the old rows could no longer be
    // read, because nothing would say what they were written with.
    const stored = await hashPassword('correct horse battery staple', CHEAP);

    expect(stored).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
  });

  it('names the limits when the password is refused for its length', () => {
    expect(() => checkPasswordPolicy('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toThrow(
      new RegExp(String(MIN_PASSWORD_LENGTH)),
    );
    expect(() => checkPasswordPolicy('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toThrow(
      new RegExp(String(MAX_PASSWORD_LENGTH)),
    );
  });

  it('accepts a password of exactly the two limits', () => {
    // The maximum is what stops a sign-in from being an expensive way to spend the platform's CPU, so
    // it is a real refusal and not a warning.
    expect(() => checkPasswordPolicy('a'.repeat(MIN_PASSWORD_LENGTH))).not.toThrow();
    expect(() => checkPasswordPolicy('a'.repeat(MAX_PASSWORD_LENGTH))).not.toThrow();
  });
});

describe('verifyPassword', () => {
  it('accepts its own password and refuses another one', async () => {
    const stored = await hashPassword('correct horse battery staple', CHEAP);

    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
    await expect(verifyPassword('correct horse battery stapl', stored)).resolves.toBe(false);
  });

  it('reads the parameters out of the stored value, so a cheaper one still verifies', async () => {
    // This is the property that makes the parameters worth storing, and the reason `verifyPassword`
    // must parse the row instead of reaching for the module's current constants.
    const stored = await hashPassword('correct horse battery staple', { ...CHEAP, cost: 1 << 9 });

    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
  });

  it('refuses a stored value it cannot read instead of throwing', async () => {
    // A corrupt row is one player who cannot sign in, and it must not be a 500 for everyone behind them.
    for (const broken of ['', 'not-a-hash', 'scrypt$x$y$z$AAAA$BBBB', 'bcrypt$1$1$1$AAAA$BBBB']) {
      await expect(verifyPassword('correct horse battery staple', broken)).resolves.toBe(false);
    }
  });

  it('has production parameters that are memory-hard rather than a bare digest', () => {
    // A regression guard on the one constant that is easy to lower for a test and forget: the work
    // factor is the whole defence if the database is ever read by somebody else.
    expect(DEFAULT_SCRYPT_PARAMETERS.cost).toBeGreaterThanOrEqual(1 << 15);
    expect(DEFAULT_SCRYPT_PARAMETERS.blockSize).toBeGreaterThanOrEqual(8);
  });
});
