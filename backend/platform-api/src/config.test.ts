import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { setAuthEnvironment } from './auth/test-app';
import { readDatabaseUrl, readGameTicketTtl, readOptional, readPort, readRequired } from './config';
import { createScratchDatabase, dropScratchDatabase, hasDatabase } from './db/test-database';

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

describe('readOptional', () => {
  it('returns the value without the whitespace around it', () => {
    expect(readOptional('  s3cret  ')).toBe('s3cret');
  });

  it('answers nothing for a variable that is not set, for a blank one and for whitespace', () => {
    // The three spellings of "not configured" are one answer here, which is what lets § 8's providers
    // and § 9's mailer switch themselves off instead of stopping the boot.
    expect(readOptional(undefined)).toBeUndefined();
    expect(readOptional('')).toBeUndefined();
    expect(readOptional('   ')).toBeUndefined();
  });
});

describe('readPort', () => {
  it('still uses the fallback and still rejects what is not a port', () => {
    expect(readPort(undefined, 3000)).toBe(3000);
    expect(readPort('8080', 3000)).toBe(8080);
    expect(() => readPort('8080.5', 3000)).toThrow(/between 1 and 65535/);
  });
});

describe('readGameTicketTtl', () => {
  it('is five minutes when the environment says nothing', () => {
    expect(readGameTicketTtl(undefined)).toBe(300);
    expect(readGameTicketTtl('')).toBe(300);
    expect(readGameTicketTtl('   ')).toBe(300);
  });

  it('is the number of seconds the environment asks for', () => {
    expect(readGameTicketTtl('120')).toBe(120);
    expect(readGameTicketTtl(' 900 ')).toBe(900);
  });

  it('rejects anything that is not a whole positive number of seconds, naming the variable', () => {
    for (const bad of ['cinco', '0', '-5', '300.5']) {
      expect(() => readGameTicketTtl(bad)).toThrow(/GAME_TICKET_TTL_SECONDS/);
    }
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
    // The case leaves the environment as it found it: the describe below reaches for a database, and a
    // URL this case invented would be the one it then tried to connect to.
    const previous = process.env.DATABASE_URL;
    try {
      // Everything else the container reads is in place, so the variable under test is the only thing
      // that can be missing: which factory Nest builds first is its business, not this case's.
      await setAuthEnvironment(undefined);
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

// The secrets a session and a ticket need are read the same way, while the container is being built.
// These two cases need a database in reach because the container connects to it before the auth side
// is instantiated — with DATABASE_URL unusable the failure would be the connection's, not the secret's.
describe.skipIf(!hasDatabase)('the platform at boot, with the rest of the environment in place', () => {
  let url: string;

  beforeAll(async () => {
    url = await createScratchDatabase();
    await setAuthEnvironment(url);
  });

  afterAll(async () => {
    await dropScratchDatabase(url);
  });

  it('does not build its container without a session secret', async () => {
    delete process.env.SESSION_SECRET;
    try {
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
        /SESSION_SECRET/,
      );
    } finally {
      await setAuthEnvironment(url);
    }
  });

  it('does not build its container with a ticket lifetime that is not a number of seconds', async () => {
    process.env.GAME_TICKET_TTL_SECONDS = 'cinco minutos';
    try {
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
        /GAME_TICKET_TTL_SECONDS/,
      );
    } finally {
      await setAuthEnvironment(url);
    }
  });

  it('does build its container with no OAuth value configured at all', async () => {
    // The state a person cloning the repository is in. Everything the container needs is present
    // except the four values from a third party, and that has to be enough to come up (§ 8).
    await setAuthEnvironment(url, { oauth: false });
    try {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      await moduleRef.close();
    } finally {
      await setAuthEnvironment(url);
    }
  });
});
