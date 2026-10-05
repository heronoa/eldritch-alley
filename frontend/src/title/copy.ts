// Title screen M1 and M2 — every line the title shows, taken from the catalog of the language the
// client is in.
//
// The markup and the screen read these instead of repeating them, so a change to the wording is a
// change to one entry of `src/i18n/catalog.pt-BR.ts`. They are resolved once, when this module
// loads: M3 turns them into a function the switcher calls again, because a constant cannot follow a
// language that changes after the page is up.
import { t } from '../i18n';

/** The document title, which is the tab and the bookmark. */
export const DOCUMENT = t('title.document');

/** The line above the name: which office filed the occurrence, and its number. */
export const META = t('title.meta');

/** The name of the game. */
export const TITLE = t('title.name');

/** The tag stamped over the name. */
export const STAMP_TAG = t('title.stampTag');

/** The pitch under the name. */
export const TAGLINE = t('title.tagline');

/** The call to action. Starts a match against the bot. */
export const CTA = t('title.cta');

/** What the call to action says while the session is being opened. */
export const CTA_BUSY = t('title.ctaBusy');

/** The keyboard shortcut, under the call to action. */
export const HINT = t('title.hint');

/** The word the stamp shows once the server has confirmed the session. */
export const GRANTED = t('title.granted');

/** What the screen says when the server does not answer. */
export const UNAVAILABLE = t('title.unavailable');

/** The version in the footer. The prototype's word for itself does not ship. */
export const FOOTER_VERSION = t('title.footerVersion');

/** Where the story is set. */
export const FOOTER_PLACE = t('title.footerPlace');
