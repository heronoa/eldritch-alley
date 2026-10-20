import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogMailer, SmtpMailer } from './adapters';
import { mailerFromEnvironment } from './mailer-from-environment';
import {
  accountDeletedMessage,
  linkedAccountMessage,
  resetLink,
  resetMessage,
  verificationLink,
  verificationMessage,
} from './messages';

// The same rule the providers got (§ 8): an account on somebody else's server is never the reason the
// project will not boot. Without the five values the platform writes the message to the log and sends
// nothing, which is what keeps the suite off the network.
const VARIABLES = [
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USER',
  'EMAIL_SMTP_PASSWORD',
  'EMAIL_FROM',
] as const;

type Variable = (typeof VARIABLES)[number];

const COMPLETE: Record<Variable, string> = {
  EMAIL_SMTP_HOST: 'smtp.zoho.com',
  EMAIL_SMTP_PORT: '465',
  EMAIL_SMTP_USER: 'no-reply@eldritch-alley.test',
  EMAIL_SMTP_PASSWORD: 'an-app-specific-password',
  EMAIL_FROM: 'Eldritch Alley <no-reply@eldritch-alley.test>',
};

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const name of VARIABLES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of VARIABLES) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function configure(values: Partial<Record<Variable, string>>): void {
  for (const name of VARIABLES) delete process.env[name];
  for (const [name, value] of Object.entries(values)) process.env[name] = value;
}

describe('mailerFromEnvironment', () => {
  it('writes to the log, and reaches no server, when nothing is configured', () => {
    expect(mailerFromEnvironment()).toBeInstanceOf(LogMailer);
  });

  it('reaches the SMTP server when all five values are there', () => {
    configure(COMPLETE);
    expect(mailerFromEnvironment()).toBeInstanceOf(SmtpMailer);
  });

  it('treats a blank value as one that is not set', () => {
    // What `docker compose` passes for `${VAR:-}`: a filled-in-looking section that configures nothing.
    configure({ ...COMPLETE, EMAIL_FROM: '   ' });
    expect(() => mailerFromEnvironment()).toThrow(/EMAIL_FROM/);
  });

  it('refuses a set that is missing a value, naming the ones that are missing', () => {
    // Half a mailer is the § 8 typo again, and here it is worse than an inconvenience: a mailer that
    // quietly swallows a password reset is a player locked out with no error anywhere.
    configure({ EMAIL_SMTP_HOST: 'smtp.zoho.com', EMAIL_SMTP_PORT: '465' });

    expect(() => mailerFromEnvironment()).toThrow(/EMAIL_SMTP_USER/);
    expect(() => mailerFromEnvironment()).toThrow(/EMAIL_SMTP_PASSWORD/);
    expect(() => mailerFromEnvironment()).toThrow(/EMAIL_FROM/);
  });

  it('refuses a port that is not a port, naming the variable', () => {
    configure({ ...COMPLETE, EMAIL_SMTP_PORT: 'quatrocentos e sessenta e cinco' });
    expect(() => mailerFromEnvironment()).toThrow(/EMAIL_SMTP_PORT/);
  });

  it('sends nothing, and does not throw, when the log adapter is the one in use', async () => {
    const mailer = mailerFromEnvironment();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(
        mailer.send(
          verificationMessage(
            'player@example.com',
            verificationLink('https://eldritch.test', 'tok'),
            'en-US',
          ),
        ),
      ).resolves.toBeUndefined();
    } finally {
      log.mockRestore();
    }
  });
});

describe('the two messages', () => {
  const ORIGIN = 'https://eldritch.test';

  it('goes to the address it was built for, and carries the link', () => {
    const message = verificationMessage(
      'player@example.com',
      verificationLink(ORIGIN, 'a-token'),
      'en-US',
    );

    expect(message.to).toBe('player@example.com');
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.text).toContain(verificationLink(ORIGIN, 'a-token'));
  });

  it('points the link at the client and not at the API', () => {
    // A link the API spends on a GET is a link spent by the first machine that reads the mailbox:
    // scanners and previews fetch every URL in a message. The token is spent by a POST the player's
    // click causes, so the link has to land on the client (§ 9, D12).
    const link = new URL(verificationLink(ORIGIN, 'a-token'));

    expect(link.origin).toBe(ORIGIN);
    expect(link.searchParams.get('token')).toBe('a-token');
    expect(link.pathname).not.toContain('auth');
  });

  it('points the reset link the same way, at a path of its own', () => {
    const verification = new URL(verificationLink(ORIGIN, 'a-token'));
    const reset = new URL(resetLink(ORIGIN, 'a-token'));

    expect(reset.origin).toBe(ORIGIN);
    expect(reset.searchParams.get('token')).toBe('a-token');
    expect(reset.pathname).not.toBe(verification.pathname);
    expect(resetMessage('player@example.com', reset.href, 'en-US').text).toContain(reset.href);
  });
});

describe('the mail in both languages', () => {
  const ORIGIN = 'https://eldritch.test';
  const LINK = verificationLink(ORIGIN, 'a-token');

  it('confirms an address in the language it was asked in, and keeps the link intact in both', () => {
    const english = verificationMessage('player@example.com', LINK, 'en-US');
    const portuguese = verificationMessage('player@example.com', LINK, 'pt-BR');

    expect(english.subject).toBe('Confirm your address — Eldritch Alley: Tactics');
    expect(english.text).toContain('Confirm this address');
    expect(portuguese.subject).toBe('Confirme seu endereço — Eldritch Alley: Tactics');
    expect(portuguese.text).toContain('Confirme este endereço');
    expect(english.text).toContain(LINK);
    expect(portuguese.text).toContain(LINK);
  });

  it('offers a new password in the language it was asked in', () => {
    const english = resetMessage('player@example.com', LINK, 'en-US');
    const portuguese = resetMessage('player@example.com', LINK, 'pt-BR');

    expect(english.subject).toBe('Choose a new password — Eldritch Alley: Tactics');
    expect(english.text).toContain('Choose it here:');
    expect(portuguese.subject).toBe('Escolha uma nova senha — Eldritch Alley: Tactics');
    expect(portuguese.text).toContain('Escolha aqui:');
  });

  it('records a deleted account in the language it was asked in, and names no link', () => {
    const english = accountDeletedMessage('player@example.com', 'en-US');
    const portuguese = accountDeletedMessage('player@example.com', 'pt-BR');

    expect(english.subject).toBe('Your account was deleted — Eldritch Alley: Tactics');
    expect(english.text).toContain('has been deleted');
    expect(portuguese.subject).toBe('Sua conta foi excluída — Eldritch Alley: Tactics');
    expect(portuguese.text).toContain('foi excluída');
    for (const message of [english, portuguese]) {
      expect(message.text).not.toContain('http');
      expect(message.text).not.toContain('token');
    }
  });

  it('names the provider in words, and translates the one a player would not recognise', () => {
    const english = linkedAccountMessage('player@example.com', 'keycloak', 'en-US');
    const portuguese = linkedAccountMessage('player@example.com', 'keycloak', 'pt-BR');

    expect(english.subject).toBe('A new way in — Eldritch Alley: Tactics');
    expect(english.text).toContain('entered with single sign-on');
    expect(english.text).not.toContain('keycloak');
    expect(portuguese.subject).toBe('Uma nova forma de entrar — Eldritch Alley: Tactics');
    expect(portuguese.text).toContain('acessada com login único');
    expect(portuguese.text).not.toContain('keycloak');
  });

  it('keeps the names that are brands the same in both languages', () => {
    for (const locale of ['en-US', 'pt-BR'] as const) {
      expect(linkedAccountMessage('player@example.com', 'github', locale).text).toContain('GitHub');
      expect(linkedAccountMessage('player@example.com', 'google', locale).text).toContain('Google');
    }
  });
});
