import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRIVACY_VERSION, privacyPath } from './version';

// The policy is a static document (D4), so this is the test that reads the files a person's browser
// reads: no build step, no JavaScript, no placeholder left open, and the date the platform records.
const portuguese = readFileSync(new URL('../../public/privacidade.html', import.meta.url), 'utf8');
const english = readFileSync(new URL('../../public/privacy.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('the privacy policy pages', () => {
  it('carry the same date, and the date is the version the platform records', () => {
    const dates = [portuguese, english].map((page) => {
      const shown = /<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/.exec(page);
      return shown?.[1];
    });

    expect(dates[0]).toBe(PRIVACY_VERSION);
    expect(dates[1]).toBe(PRIVACY_VERSION);
    expect(portuguese).toContain('17 de outubro de 2026');
    expect(english).toContain('October 17, 2026');
  });

  it('reference each other in both directions, with hreflang and the document’s own language', () => {
    expect(portuguese).toContain('<html lang="pt-BR">');
    expect(english).toContain('<html lang="en-US">');

    for (const page of [portuguese, english]) {
      expect(page).toMatch(/<link[^>]+rel="alternate"[^>]+hreflang="pt-BR"[^>]+href="\/privacidade\.html"/);
      expect(page).toMatch(/<link[^>]+rel="alternate"[^>]+hreflang="en-US"[^>]+href="\/privacy\.html"/);
    }
  });

  it('has no placeholder left open, and the six answers are all in the text', () => {
    for (const page of [portuguese, english]) expect(page).not.toMatch(/\[[^\]]*\]/);

    for (const value of [
      'Heron Oliveira Amaral',
      '58.978.216/0001-06',
      'suporte@heronoa.com.br',
      'us-east-1',
      'Norte da Virgínia',
      'Zoho',
      'Estados Unidos',
    ]) {
      expect(portuguese, value).toContain(value);
    }

    for (const value of [
      'Heron Oliveira Amaral',
      '58.978.216/0001-06',
      'suporte@heronoa.com.br',
      'us-east-1',
      'Northern Virginia',
      'Zoho',
      'United States',
    ]) {
      expect(english, value).toContain(value);
    }
  });

  it('renders with JavaScript off: neither page carries a script', () => {
    expect(portuguese).not.toMatch(/<script/i);
    expect(english).not.toMatch(/<script/i);
  });
});

describe('the three links to the policy', () => {
  it('answers the page of the locale the client is in', () => {
    expect(privacyPath('pt-BR')).toBe('/privacidade.html');
    expect(privacyPath('en-US')).toBe('/privacy.html');
  });

  it('is in the sign-in panel, the contact form and the footer, with the Portuguese fallback', () => {
    for (const id of ['auth-privacy', 'contact-privacy', 'privacy-link']) {
      const link = new RegExp(`<a[^>]*id="${id}"[^>]*>`).exec(index);
      expect(link, id).not.toBeNull();
      expect(link?.[0], id).toContain('href="/privacidade.html"');
    }

    for (const path of [
      '../title/title.ts',
      '../account/account.ts',
      '../contact/contact-panel.ts',
    ]) {
      expect(source(path), path).toContain('privacyPath(');
    }
  });

  it('leaves the release-e-mail consent unchecked in the markup', () => {
    const checkbox = /<input[^>]*id="profile-release-emails"[^>]*>/.exec(index);

    expect(checkbox).not.toBeNull();
    expect(checkbox?.[0]).not.toMatch(/\bchecked\b/);
  });
});
