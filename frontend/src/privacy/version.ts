// The policy's own date. It is duplicated on purpose (D5 of the m4-05 plan): the platform stores this
// string in `privacy_version_seen`, the pages print it, and the two sides cannot import each other. A
// test on each side holds its own copy, so an edit to the policy without a bump is a red suite.
import type { Locale } from '../i18n';

export const PRIVACY_VERSION = '2026-10-17';

/** The page of the policy in the language on screen. */
export function privacyPath(locale: Locale): string {
  return locale === 'pt-BR' ? '/privacidade.html' : '/privacy.html';
}
