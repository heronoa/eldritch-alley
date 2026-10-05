// The catalogs, side by side, and what a lookup does when a locale has not translated a key.
//
// `pt-BR` is the reference — see decision 5 of the plan. A missing English key is a gap the client
// fills with the Portuguese text rather than a blank on the screen, which is what lets a translation
// land one area at a time without the rest of the game changing.

import { ptBR, type MessageKey } from './catalog.pt-BR';
import { enUS } from './catalog.en-US';
import type { Locale } from './locale';

const CATALOGS: Record<Locale, Partial<Record<MessageKey, string>>> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

/** The text of a key in a locale, or the reference text when that locale has not translated it. */
export function message(locale: Locale, key: MessageKey): string {
  return CATALOGS[locale][key] ?? ptBR[key];
}

/** The reference keys a locale does not translate yet, in the reference's own order. */
export function missingKeys(locale: Locale): MessageKey[] {
  const catalog = CATALOGS[locale];
  return (Object.keys(ptBR) as MessageKey[]).filter((key) => !(key in catalog));
}
