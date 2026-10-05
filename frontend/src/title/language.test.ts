// Localization M3 — the switcher's rules, away from the DOM: which buttons exist, what they show,
// and when a press means nothing.
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n';
import { LANGUAGE_OPTIONS, switchesTo } from './language';

describe('the language switcher', () => {
  it('has one button per locale the client ships, in the order they are listed', () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.locale)).toEqual([...LOCALES]);
  });

  it('shows the two letters of the language, which read the same in both locales', () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.label)).toEqual(['PT', 'EN']);
  });

  it('changes the language when the other one is pressed', () => {
    expect(switchesTo('pt-BR', 'en-US')).toBe(true);
    expect(switchesTo('en-US', 'pt-BR')).toBe(true);
  });

  it('does nothing when the language already on screen is pressed', () => {
    for (const locale of LOCALES) {
      expect(switchesTo(locale, locale), locale).toBe(false);
    }
  });
});
