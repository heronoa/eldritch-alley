// Title screen M1, localization M3 — every line the title shows, read from the catalog of the
// language the client is in.
//
// The markup and the screen read these instead of repeating them, so a change to the wording is a
// change to one entry of `src/i18n/catalog.pt-BR.ts`. The title screen held them as constants, which
// was enough while the language could not change; localization M3 reads them again on every call,
// because the switcher rewrites the screen and a constant cannot follow a language that changes
// after the page is up.
import { t } from '../i18n';

/**
 * One line of the title screen, by the name `title.ts` knows it by. The keys of this type are the
 * lines: a line that is missing here is a compile error, and one that has no entry in the reference
 * catalog is another.
 */
export interface TitleCopy {
  /** The document title, which is the tab and the bookmark. */
  readonly document: string;
  /** The line above the name: which office filed the occurrence, and its number. */
  readonly meta: string;
  /** The name of the game. */
  readonly name: string;
  /** The tag stamped over the name. */
  readonly stampTag: string;
  /** The pitch under the name. */
  readonly tagline: string;
  /** The call to action. Starts a match against the bot. */
  readonly cta: string;
  /** What the call to action says while the session is being opened. */
  readonly ctaBusy: string;
  /** The keyboard shortcut, under the call to action. */
  readonly hint: string;
  /** The word the stamp shows once the server has confirmed the session. */
  readonly granted: string;
  /** What the screen says when the server does not answer. */
  readonly unavailable: string;
  /** What the screen says when the room refused the seat because another session holds it. */
  readonly occupied: string;
  /** The version in the footer. The prototype's word for itself does not ship. */
  readonly footerVersion: string;
  /** Where the story is set. */
  readonly footerPlace: string;
  /** What the language switcher is called, for a screen reader. */
  readonly language: string;
}

/** Every line of the title, in the language the client is showing right now. */
export function titleCopy(): TitleCopy {
  return {
    document: t('title.document'),
    meta: t('title.meta'),
    name: t('title.name'),
    stampTag: t('title.stampTag'),
    tagline: t('title.tagline'),
    cta: t('title.cta'),
    ctaBusy: t('title.ctaBusy'),
    hint: t('title.hint'),
    granted: t('title.granted'),
    unavailable: t('title.unavailable'),
    occupied: t('title.occupied'),
    footerVersion: t('title.footerVersion'),
    footerPlace: t('title.footerPlace'),
    language: t('title.language'),
  };
}
