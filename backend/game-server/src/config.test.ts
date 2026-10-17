import { describe, expect, it } from 'vitest';
import { readMaxConcurrentMatches, readPort, readPublicKey, readQueueUrl } from './config';

describe('readPort', () => {
  it('uses the fallback when the variable is not set', () => {
    expect(readPort(undefined, 2567)).toBe(2567);
    expect(readPort('', 2567)).toBe(2567);
  });

  it('reads a port from the variable', () => {
    expect(readPort('8080', 2567)).toBe(8080);
  });

  it('rejects values that are not a port', () => {
    expect(() => readPort('abc', 2567)).toThrow(/between 1 and 65535, got abc/);
    expect(() => readPort('0', 2567)).toThrow(/between 1 and 65535/);
    expect(() => readPort('65536', 2567)).toThrow(/between 1 and 65535/);
    expect(() => readPort('25.5', 2567)).toThrow(/between 1 and 65535/);
  });
});

describe('readMaxConcurrentMatches', () => {
  it('uses the fallback when the variable is not set', () => {
    expect(readMaxConcurrentMatches(undefined, 30)).toBe(30);
    expect(readMaxConcurrentMatches('', 30)).toBe(30);
  });

  it('reads a value from the variable', () => {
    expect(readMaxConcurrentMatches('50', 30)).toBe(50);
  });

  it('rejects values that are not a positive integer', () => {
    expect(() => readMaxConcurrentMatches('abc', 30)).toThrow(/positive integer, got abc/);
    expect(() => readMaxConcurrentMatches('0', 30)).toThrow(/positive integer/);
    expect(() => readMaxConcurrentMatches('-5', 30)).toThrow(/positive integer/);
    expect(() => readMaxConcurrentMatches('2.5', 30)).toThrow(/positive integer/);
  });
});

describe('readPublicKey', () => {
  it('is nothing when the variable is not set, so a server with no key serves guests', () => {
    expect(readPublicKey(undefined)).toBeUndefined();
    expect(readPublicKey('')).toBeUndefined();
  });

  it('reads a PEM from the variable', () => {
    expect(readPublicKey('-----BEGIN PUBLIC KEY-----\nMC4w\n-----END PUBLIC KEY-----\n')).toBe(
      '-----BEGIN PUBLIC KEY-----\nMC4w\n-----END PUBLIC KEY-----\n',
    );
  });

  /**
   * A PEM in an environment variable arrives with its line breaks escaped, because a value cannot hold a
   * newline in an env file or in a `docker run -e`. `docker compose` undoes that itself and node's
   * `--env-file`, which `npm run dev` uses, does not — and the two spellings have to become one here
   * rather than in every developer's shell.
   */
  it('turns the escaped line breaks back into newlines', () => {
    expect(readPublicKey('-----BEGIN PUBLIC KEY-----\\nMC4w\\n-----END PUBLIC KEY-----\\n')).toBe(
      '-----BEGIN PUBLIC KEY-----\nMC4w\n-----END PUBLIC KEY-----\n',
    );
  });
});

describe('readQueueUrl', () => {
  it('reads the queue from the variable', () => {
    expect(readQueueUrl('http://localhost:4566/000000000000/match-ended')).toBe(
      'http://localhost:4566/000000000000/match-ended',
    );
  });

  /**
   * Required, and deliberately not a fallback. Without a queue every match a signed-in player finishes
   * loses its history and nothing says so — the match plays on, the room logs nothing, and the loss is
   * found by a player looking at an empty list. Stopping at boot names the variable while somebody is
   * still watching, which is the same argument the platform's mailer makes.
   */
  it('stops the server when it is missing, naming the variable', () => {
    expect(() => readQueueUrl(undefined)).toThrow(/MATCH_ENDED_QUEUE_URL/);
    expect(() => readQueueUrl('')).toThrow(/MATCH_ENDED_QUEUE_URL/);
  });
});
