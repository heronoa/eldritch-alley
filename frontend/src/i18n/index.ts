// The i18n module's public surface. Screens import from here and never from a file inside it, so the
// catalogs and the resolution order stay free to move.
//
// `docs/adr/0009-client-localization.md` records why this is a module of its own and not a library.

export { LOCALES, FALLBACK_LOCALE, isLocale, resolveLocale, type Locale } from './locale';
export { LOCALE_STORAGE_KEY, readSavedLocale, saveLocale, type LocaleStorage } from './storage';
export { ptBR, type MessageKey } from './catalog.pt-BR';
export { enUS } from './catalog.en-US';
export { message, missingKeys } from './messages';
// `interpolate` is deliberately not here: `t()` is the interface the screens use, and how a message
// fills its placeholders is free to change behind it.
export { detectLocale, getLocale, setLocale, t, type MessageParams } from './translate';
