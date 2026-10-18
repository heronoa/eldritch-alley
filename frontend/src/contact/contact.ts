// The contact form's pure half: what a form has to be before it is worth a request, the body the
// platform expects, and the four failures the form tells apart. The DOM half (`contact-panel.ts`)
// only writes these answers onto the page.
import { ApiError } from '../api/errors';
import { type Locale, t } from '../i18n';

/** The longest message the platform accepts. Kept in step with `CONTACT_MESSAGE_LIMIT` server-side. */
export const CONTACT_MESSAGE_LIMIT = 5_000;

/** The field a form is missing, or `null` when there is nothing left to fix. */
export type ContactField = 'name' | 'email' | 'message';

/** What the player typed, exactly as typed. */
export interface ContactDraft {
  name: string;
  email: string;
  message: string;
}

/** The body `POST /contact` reads. */
export interface ContactRequest {
  name: string;
  email: string;
  message: string;
  turnstileToken: string;
  locale: Locale;
}

/** How a send failed, as the form says it: a spent limit, a refused challenge, an outage, the rest. */
export type ContactFailure = 'rate-limited' | 'challenge-failed' | 'offline' | 'unknown';

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The body of a request, trimmed at the boundary so the platform never stores stray whitespace. */
export function contactRequest(
  draft: ContactDraft,
  turnstileToken: string,
  locale: Locale,
): ContactRequest {
  return {
    name: draft.name.trim(),
    email: draft.email.trim(),
    message: draft.message.trim(),
    turnstileToken,
    locale,
  };
}

/**
 * What is wrong with the form, if anything. The order is the fields' own, so the first empty field is
 * the one named — which is what the player has to fix before the next one can be judged.
 */
export function validateContact(draft: ContactDraft): ContactField | null {
  if (draft.name.trim() === '') return 'name';
  if (!EMAIL_ADDRESS.test(draft.email.trim())) return 'email';

  const message = draft.message.trim();
  if (message === '' || message.length > CONTACT_MESSAGE_LIMIT) return 'message';
  return null;
}

/** The kind of failure a caught value is, for a form that answers each one with its own sentence. */
export function contactFailure(error: unknown): ContactFailure {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.kind === 'offline') return 'offline';
  if (error.status === 429) return 'rate-limited';
  if (error.status === 403) return 'challenge-failed';
  return 'unknown';
}

/** Every line the contact form shows. */
export interface ContactCopy {
  readonly title: string;
  readonly nameLabel: string;
  readonly emailLabel: string;
  readonly messageLabel: string;
  readonly submit: string;
  readonly sending: string;
  readonly privacyLabel: string;
  readonly sentHeading: string;
  readonly sentBody: string;
  readonly close: string;
  readonly problems: Readonly<Record<ContactFailure, string>>;
  readonly fieldProblems: Readonly<Record<ContactField, string>>;
}

/** Every line the form shows, in the language the client is in right now. */
export function contactCopy(): ContactCopy {
  return {
    title: t('contact.title'),
    nameLabel: t('contact.field.name'),
    emailLabel: t('contact.field.email'),
    messageLabel: t('contact.field.message'),
    submit: t('contact.submit'),
    sending: t('contact.sending'),
    privacyLabel: t('contact.privacyLabel'),
    sentHeading: t('contact.sent.heading'),
    sentBody: t('contact.sent.body'),
    close: t('contact.close'),
    problems: {
      'rate-limited': t('contact.problem.rateLimited'),
      'challenge-failed': t('contact.problem.challengeFailed'),
      offline: t('contact.problem.offline'),
      unknown: t('contact.problem.unknown'),
    },
    fieldProblems: {
      name: t('contact.problem.name'),
      email: t('contact.problem.email'),
      message: t('contact.problem.message'),
    },
  };
}

/** The language Cloudflare's widget draws its own text in. */
export function turnstileLanguage(locale: Locale): string {
  return locale === 'pt-BR' ? 'pt-br' : 'en';
}
