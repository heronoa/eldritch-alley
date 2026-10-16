import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { readDatabaseUrl, readPort, readRequired } from './config';

describe('readDatabaseUrl', () => {
  it('returns a postgres:// or postgresql:// URL unchanged', () => {
    expect(readDatabaseUrl('postgres://eldritch:eldritch@localhost:5432/eldritch_alley')).toBe(
      'postgres://eldritch:eldritch@localhost:5432/eldritch_alley',
    );
    expect(readDatabaseUrl('postgresql://eldritch@postgres:5432/eldritch_alley')).toBe(
      'postgresql://eldritch@postgres:5432/eldritch_alley',
    );
  });

  it('rejects a missing, an empty and a non-postgres URL, naming the variable', () => {
    expect(() => readDatabaseUrl(undefined)).toThrow(/DATABASE_URL/);
    expect(() => readDatabaseUrl('')).toThrow(/DATABASE_URL/);
    expect(() => readDatabaseUrl('mysql://localhost:3306/eldritch_alley')).toThrow(/DATABASE_URL/);
    expect(() => readDatabaseUrl('localhost:5432')).toThrow(/DATABASE_URL/);
  });
});

describe('readRequired', () => {
  it('returns the value without the whitespace around it', () => {
    expect(readRequired('  s3cret  ', 'SESSION_SECRET')).toBe('s3cret');
  });

  it('rejects a missing and a blank value, naming the variable', () => {
    expect(() => readRequired(undefined, 'SESSION_SECRET')).toThrow(/SESSION_SECRET/);
    expect(() => readRequired('', 'SESSION_SECRET')).toThrow(/SESSION_SECRET/);
    expect(() => readRequired('   ', 'SESSION_SECRET')).toThrow(/SESSION_SECRET/);
  });
});

describe('readPort', () => {
  it('still uses the fallback and still rejects what is not a port', () => {
    expect(readPort(undefined, 3000)).toBe(3000);
    expect(readPort('8080', 3000)).toBe(8080);
    expect(() => readPort('8080.5', 3000)).toThrow(/between 1 and 65535/);
  });
});

// The database is not read by a service at its first query: it is read while the container is being
// built, so a platform with an unusable DATABASE_URL fails to come up rather than answering requests
// with errors. That is the shape `readPort` already has, and neither case needs a database to check.
//
// Through the testing container rather than through `NestFactory.create`, which aborts the process
// (`process.abort()`) when a provider factory throws — a test that asserts a boot failure cannot be
// run in the process it kills.
describe('the platform at boot', () => {
  it('does not build its container without a usable DATABASE_URL', async () => {
    const previous = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
        /DATABASE_URL/,
      );

      process.env.DATABASE_URL = 'mysql://localhost:3306/eldritch_alley';
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
        /DATABASE_URL/,
      );
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});
