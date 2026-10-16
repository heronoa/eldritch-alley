// Localization M3 — the language switcher's rules, away from the DOM: which buttons exist, what they
// show, and when a press means nothing. `title.ts` builds the buttons from this and does the rest.
import { LOCALES, type Locale } from '../i18n';

/** One button of the switcher: the locale it selects and the two letters it shows. */
export interface LanguageOption {
  readonly locale: Locale;
  readonly label: string;
}

/**
 * What each button shows. The language's own code, which reads the same in either language — a
 * player looking for their own language looks for these two letters, not for a translated word.
 * `title.ts` writes each label with `lang` set to the locale it selects, so a screen reader
 * announces it in that language instead of in the one the page happens to be showing.
 */
const LABELS: Record<Locale, string> = {
  'pt-BR': 'PT',
  'en-US': 'EN',
};

/**
 * The switcher's buttons, in the order the locales are listed. Built from `LOCALES`, so a language
 * the client ships cannot be left without a button, and `LABELS` is a `Record`, so adding one
 * without its two letters does not compile.
 */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = LOCALES.map((locale) => ({
  locale,
  label: LABELS[locale],
}));

/**
 * Whether a press on this button changes the language. Pressing the one already on screen is not a
 * change: the caller has nothing to write again, and the choice is not saved a second time.
 */
export function switchesTo(current: Locale, pressed: Locale): boolean {
  return current !== pressed;
}
