import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Passwords, hashed with the standard library's scrypt and nothing else.
 *
 * Argon2id is the better password hash on the merits and this is not it. The runtime image is
 * `node:22-alpine`, which is musl, so `argon2` would put `python3`, `make` and `g++` into the build stage
 * and `@node-rs/argon2` would put platform-specific optional packages into a lockfile that is resolved on
 * glibc. scrypt is memory-hard, ships with Node, is a dependency nobody has to keep patched, and has
 * `timingSafeEqual` beside it. This is the same trade the platform made when it took `jose` over a larger
 * stack (ADR 0021).
 */

export interface ScryptParameters {
  /** The work factor: CPU and memory both scale with it, and it is the whole defence on a stolen row. */
  cost: number;
  /** Memory per iteration. 8 is the value scrypt was designed around. */
  blockSize: number;
  /** Parallelisation. 1 because a server is already doing this for several players at once. */
  parallelization: number;
}

/** 2^15. Around a tenth of a second per hash on the hardware this deploys to, which is felt by a person
 *  once per sign-in and by an attacker once per guess. */
export const DEFAULT_SCRYPT_PARAMETERS: ScryptParameters = {
  cost: 1 << 15,
  blockSize: 8,
  parallelization: 1,
};

/**
 * Length only, no composition rule. Twelve is the shortest password that is not a word with a number
 * after it, and 128 is a real refusal rather than a warning: without a maximum, a sign-in is a way to
 * make the platform spend a minute of CPU on demand, and the work factor is what an attacker would be
 * choosing.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

/** The one place the length policy is written. Throws the refusal the caller turns into a 400. */
export function checkPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`A password can be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
}

/**
 * The stored form of a password: `scrypt$<cost>$<blockSize>$<parallelization>$<salt>$<key>`, both halves
 * base64.
 *
 * The parameters travel with the value. They have to: a row written under yesterday's work factor has to
 * keep verifying after today's is raised, and a bare digest carries nothing that says how it was made.
 * The salt is per hash, so two players who choose the same password get two different stored values.
 */
export async function hashPassword(
  password: string,
  parameters: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, parameters);
  const { cost, blockSize, parallelization } = parameters;

  return [
    PREFIX,
    cost,
    blockSize,
    parallelization,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Whether a password is the one behind a stored value. Answers `false` for anything it cannot read: a
 * corrupt row is one player who cannot sign in, and it must not be a 500 for everybody behind them.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (parsed === null) return false;

  const key = await derive(password, parsed.salt, parsed.parameters);
  // Length first: `timingSafeEqual` throws on two buffers of different sizes, and a refusal that is an
  // exception is a refusal that reaches the player as a 500.
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

interface StoredPassword {
  parameters: ScryptParameters;
  salt: Buffer;
  key: Buffer;
}

function parseStored(stored: string): StoredPassword | null {
  const [prefix, cost, blockSize, parallelization, salt, key] = stored.split('$');
  if (prefix !== PREFIX || key === undefined || salt === undefined) return null;

  const parameters = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
  };
  if (Object.values(parameters).some((value) => !Number.isSafeInteger(value) || value < 1)) return null;

  return { parameters, salt: Buffer.from(salt, 'base64'), key: Buffer.from(key, 'base64') };
}

function derive(password: string, salt: Buffer, parameters: ScryptParameters): Promise<Buffer> {
  // `maxmem` is not a limit anybody wants to think about: Node's default is 32 MiB, and scrypt needs
  // `128 * cost * blockSize` — which is exactly 32 MiB at the parameters above, so the default refuses
  // the very hash this module is built to make. Twice what the parameters ask for is the smallest
  // honest number, and it moves with them.
  const maxmem = 128 * parameters.cost * parameters.blockSize * 2;
  const options = {
    N: parameters.cost,
    r: parameters.blockSize,
    p: parameters.parallelization,
    maxmem,
  };

  return scryptAsync(password, salt, KEY_LENGTH, options) as Promise<Buffer>;
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;
