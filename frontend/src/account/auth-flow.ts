// The sign-in dialog as rules: which step a press moves to, whether a form may be sent, and which
// failure the screen names. The DOM half asks here and writes what it answers.
//
// The password policy mirrors the platform's (`backend/platform-api/src/auth/password.ts`). It is
// checked here so a typo is answered before a round trip, and still checked there, because a browser is
// not the authority on what a password may be.
import { failureOf, isRefused } from '../api/errors';

/** Where the dialog is. `check-mail` is the whole answer of a sign-up, a resend and a forgotten password. */
export type AuthStep = 'closed' | 'sign-in' | 'sign-up' | 'forgot' | 'check-mail';

export type AuthEvent = 'open' | 'close' | 'sign-in' | 'sign-up' | 'forgot' | 'sent' | 'back';

/** The platform's own bounds. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export interface AuthFields {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export const EMPTY_FIELDS: AuthFields = { email: '', password: '', displayName: '' };

/**
 * The step one event later. An event the step does not answer answers the step it was given, so a
 * press the screen ignores costs nothing.
 */
export function nextStep(step: AuthStep, event: AuthEvent): AuthStep {
  switch (step) {
    case 'closed':
      if (event === 'open' || event === 'sign-in') return 'sign-in';
      if (event === 'sign-up') return 'sign-up';
      if (event === 'forgot') return 'forgot';
      return step;

    case 'sign-in':
    case 'sign-up':
    case 'forgot':
      if (event === 'close') return 'closed';
      if (event === 'sign-in' || event === 'sign-up' || event === 'forgot') return event;
      if (event === 'sent') return 'check-mail';
      // A `back` from a form that has a tab strip returns to the first tab.
      if (event === 'back') return 'sign-in';
      return step;

    case 'check-mail':
      if (event === 'close') return 'closed';
      if (event === 'back') return 'sign-in';
      return step;
  }
}

/** Whether the step's form has everything it needs. The email is required in every form but `closed`. */
export function canSubmit(step: AuthStep, fields: AuthFields): boolean {
  const email = fields.email.trim();

  switch (step) {
    case 'sign-in':
      // The login route has no length policy, and a rule here that the platform does not have would
      // lock out an old password that predates it.
      return email !== '' && fields.password !== '';
    case 'sign-up':
      return email !== '' && passwordProblem(fields.password) === null;
    case 'forgot':
      return email !== '';
    case 'closed':
    case 'check-mail':
      return false;
  }
}

/** Why a new password is not one yet, or `null` when it is. */
export function passwordProblem(password: string): 'too-short' | 'too-long' | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too-short';
  if (password.length > MAX_PASSWORD_LENGTH) return 'too-long';
  return null;
}

/** Whether the confirmation matches. The reset page asks for it; the register route does not. */
export function confirmationProblem(password: string, confirmation: string): 'mismatch' | null {
  return password === confirmation ? null : 'mismatch';
}

/** The lines the sign-in form can show. Each is a thing the player can do something about. */
export type SignInProblem =
  | 'invalid-credentials'
  | 'email-not-verified'
  | 'too-many-attempts'
  | 'offline'
  | 'unknown';

export function signInFailure(error: unknown): SignInProblem {
  if (isRefused(error, 'invalid_credentials')) return 'invalid-credentials';
  if (isRefused(error, 'email_not_verified')) return 'email-not-verified';
  if (isRefused(error, 'too_many_attempts')) return 'too-many-attempts';
  return failureOf(error) === 'offline' ? 'offline' : 'unknown';
}

/** The lines the sign-up, resend and forgot forms can show. */
export type FormProblem = 'invalid-password' | 'invalid-body' | 'offline' | 'unknown';

export function formFailure(error: unknown): FormProblem {
  if (isRefused(error, 'invalid_password')) return 'invalid-password';
  if (isRefused(error, 'invalid_body')) return 'invalid-body';
  return failureOf(error) === 'offline' ? 'offline' : 'unknown';
}

/** The lines the reset page can show. An unreadable link is a refusal of its own. */
export type ResetProblem = 'invalid-token' | 'invalid-password' | 'offline' | 'unknown';

export function resetFailure(error: unknown): ResetProblem {
  if (isRefused(error, 'invalid_token')) return 'invalid-token';
  if (isRefused(error, 'invalid_password')) return 'invalid-password';
  return failureOf(error) === 'offline' ? 'offline' : 'unknown';
}
