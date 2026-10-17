// The two pages a mailed link lands on, as rules: the token the address carries, where a press moves
// the page, and what it says in every state. The DOM half reads the address, writes these strings and
// hands each press here — the same split the title and the onboarding keep.
//
// The token is read, never spent, by opening the page: the mailed link is opened once by a mail client
// that may prefetch it, and ADR 0021 § D12 puts the spend on a press. That is why both pages have a
// button even when their body carries no field.
import { failureOf, isRefused } from '../api/errors';
import { confirmationProblem, passwordProblem, resetFailure } from './auth-flow';
import type { MailCopy, MailProblem } from './copy';

/** The page the link points at. `verify-email` spends the token on a press; `reset-password` also asks
 * for a new password. */
export type MailKind = 'verify' | 'reset';

/** Where the page is. `missing-token` is an address that never carried one; `invalid-token` is one the
 * platform refused, which is the same sentence for a used link and a forged one. */
export type MailState =
  | { readonly status: 'ready' }
  | { readonly status: 'working' }
  | { readonly status: 'done' }
  | { readonly status: 'invalid-token' }
  | { readonly status: 'missing-token' }
  | { readonly status: 'problem'; readonly problem: MailProblem };

/** The token the address carries, or `null` when it carries none. It is not touched. */
export function tokenFrom(search: string): string | null {
  const token = new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get('token');
  return token === null || token === '' ? null : token;
}

/** The page as the address leaves it: ready to ask, or with no token to ask with. */
export function initialMailState(search: string): MailState {
  return tokenFrom(search) === null ? { status: 'missing-token' } : { status: 'ready' };
}

/**
 * Why a new password is not one yet, checked before the platform is asked: the length policy, then the
 * confirmation. `null` when the two fields are ready to send.
 */
export function resetProblem(password: string, confirmation: string): MailProblem | null {
  return passwordProblem(password) ?? confirmationProblem(password, confirmation);
}

/**
 * The page after a request failed. An unreadable link is a state of its own — the page offers the way
 * back instead of a button that can only fail again — while everything else keeps the form up.
 */
export function mailFailure(kind: MailKind, error: unknown): MailState {
  if (isRefused(error, 'invalid_token')) return { status: 'invalid-token' };

  if (kind === 'reset') {
    const problem = resetFailure(error);
    return problem === 'invalid-token' ? { status: 'invalid-token' } : { status: 'problem', problem };
  }

  return { status: 'problem', problem: failureOf(error) === 'offline' ? 'offline' : 'unknown' };
}

/** Everything one of the two pages shows, in the language the copy was read in. */
export interface MailView {
  readonly heading: string;
  readonly body: string;
  /** The button under the card, or `null` in the states that have nothing left to press. */
  readonly action: string | null;
  readonly actionEnabled: boolean;
  /** Whether the button says it is waiting, which is also why it does not answer. */
  readonly working: boolean;
  /** Whether the card asks for a password and its confirmation: the reset page, and only while it can. */
  readonly passwordFields: boolean;
  readonly problem: string | null;
  readonly back: string;
  readonly passwordLabel: string;
  readonly confirmationLabel: string;
  readonly passwordHint: string;
}

export function mailView(kind: MailKind, state: MailState, copy: MailCopy): MailView {
  const ready = {
    heading: kind === 'verify' ? copy.verifyHeading : copy.resetHeading,
    body: kind === 'verify' ? copy.verifyBody : copy.resetBody,
    action: kind === 'verify' ? copy.verifyAction : copy.resetAction,
    actionEnabled: true,
    working: false,
    passwordFields: kind === 'reset',
    problem: null,
  };
  const shared = {
    back: copy.back,
    passwordLabel: copy.passwordLabel,
    confirmationLabel: copy.confirmationLabel,
    passwordHint: copy.passwordHint,
  };

  switch (state.status) {
    case 'ready':
      return { ...ready, ...shared };

    case 'working':
      return {
        ...ready,
        ...shared,
        action: kind === 'verify' ? copy.verifyWorking : copy.resetWorking,
        actionEnabled: false,
        working: true,
      };

    case 'problem':
      return { ...ready, ...shared, problem: copy.problems[state.problem] };

    case 'done':
      return {
        ...shared,
        heading: kind === 'verify' ? copy.verifyDoneHeading : copy.resetDoneHeading,
        body: kind === 'verify' ? copy.verifyDoneBody : copy.resetDoneBody,
        action: null,
        actionEnabled: false,
        working: false,
        passwordFields: false,
        problem: null,
      };

    case 'invalid-token':
      return {
        ...shared,
        heading: copy.invalidHeading,
        body: copy.invalidBody,
        action: null,
        actionEnabled: false,
        working: false,
        passwordFields: false,
        problem: null,
      };

    case 'missing-token':
      return {
        ...shared,
        heading: copy.missingHeading,
        body: copy.missingBody,
        action: null,
        actionEnabled: false,
        working: false,
        passwordFields: false,
        problem: null,
      };
  }
}
