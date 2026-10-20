// Onboarding m1 — every line the sequence shows, read from the catalog of the language the client is
// in, on the same contract as `title/copy.ts`.
//
// The wording itself is the owner's to review before this milestone closes, so nothing here pins a
// sentence: what is held is that every card and every control has a line in either language, that the
// line is never empty, and that it follows the language rather than being read once and kept.
import { describe, expect, it } from 'vitest';
import { setLocale, type Locale } from '../i18n';
import { ONBOARDING_CARDS } from './content';
import { onboardingCopy, type OnboardingCopy } from './copy';

const LOCALES = ['pt-BR', 'en-US'] as const;

/** The copy, in a named language: it is read in the locale the test means. */
function copyIn(locale: Locale): OnboardingCopy {
  setLocale(locale);
  return onboardingCopy();
}

/** The two lines of every card, as the screen reads them. */
function cardLines(copy: OnboardingCopy): readonly (readonly [string, string])[] {
  return ONBOARDING_CARDS.map((card) => [copy.cards[card.id].heading, copy.cards[card.id].body]);
}

/** The lines of the four controls and of the footer link, as the screen reads them. */
function controlLines(copy: OnboardingCopy): readonly string[] {
  return [copy.advance, copy.back, copy.skip, copy.finish, copy.howToPlay];
}

describe('the copy of the sequence', () => {
  it('has a heading and a body for every card, in either language, and none of them empty', () => {
    for (const locale of LOCALES) {
      const lines = cardLines(copyIn(locale));
      expect(lines.length, locale).toBe(ONBOARDING_CARDS.length);

      for (const [heading, body] of lines) {
        expect(heading.trim(), locale).not.toBe('');
        expect(body.trim(), locale).not.toBe('');
      }
    }
  });

  it('has a line for every control, in either language: what each button says and what the link says', () => {
    for (const locale of LOCALES) {
      for (const line of controlLines(copyIn(locale))) {
        expect(line.trim(), locale).not.toBe('');
      }
    }
  });

  it('is written in the language the client is showing, not read once and kept', () => {
    // The switcher rewrites the overlay while it is open, so the copy is read again on every call: a
    // constant could not follow a language that changes after the page is up.
    const pt = copyIn('pt-BR');
    const en = copyIn('en-US');

    expect(en.advance).not.toBe(pt.advance);
    for (const card of ONBOARDING_CARDS) {
      expect(en.cards[card.id].body, card.id).not.toBe(pt.cards[card.id].body);
    }
  });
});
