import { describe, expect, it, vi } from 'vitest';
import { LogMailer } from './adapters';
import { releaseMessage, unsubscribeLink } from './messages';

// The release message is built where every other message is, and it carries the link a person clicks
// to stop receiving it. The refusal of an opted-out subscription lives here and not in an adapter: the
// adapter is generic, and a message that forgets the link must not be constructible at all (§ 8).
const API = 'https://api.eldritch.test';

const SUBSCRIPTION = {
  email: 'player@example.com',
  token: 'a-token',
  optedIn: true,
};

describe('the release message', () => {
  it('refuses to build a message for a subscription whose opted-in is false', () => {
    expect(() => releaseMessage(API, { ...SUBSCRIPTION, optedIn: false }, 'en-US')).toThrow(/opted/i);
  });

  it('carries the unsubscribe link of the subscription’s own token', () => {
    const message = releaseMessage(API, SUBSCRIPTION, 'en-US');

    expect(message.to).toBe('player@example.com');
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.text).toContain(unsubscribeLink(API, 'a-token'));

    const link = new URL(unsubscribeLink(API, 'a-token'));
    expect(link.origin).toBe(API);
    expect(link.pathname).toBe('/unsubscribe/a-token');
    expect(link.searchParams.get('token')).toBeNull();
  });

  it('writes the message and the link in the language it was asked in', () => {
    const english = releaseMessage(API, SUBSCRIPTION, 'en-US');
    const portuguese = releaseMessage(API, SUBSCRIPTION, 'pt-BR');

    expect(english.subject).toBe('News from Eldritch Alley: Tactics');
    expect(english.text).toContain('unsubscribe');
    expect(portuguese.subject).toBe('Novidades de Eldritch Alley: Tactics');
    expect(portuguese.text).toContain('cancelar');
    for (const message of [english, portuguese]) {
      expect(message.text).toContain(unsubscribeLink(API, SUBSCRIPTION.token));
    }
  });
});

describe('the log adapter', () => {
  it('writes the whole message and sends nothing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const message = releaseMessage(API, SUBSCRIPTION, 'en-US');
      await expect(new LogMailer().send(message)).resolves.toBeUndefined();

      const written = log.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(written).toContain(message.to);
      expect(written).toContain(message.subject);
      expect(written).toContain(unsubscribeLink(API, SUBSCRIPTION.token));
    } finally {
      log.mockRestore();
    }
  });
});
