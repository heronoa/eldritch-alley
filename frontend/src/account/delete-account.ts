// The deletion form as rules: whether the typed word is the one the platform takes, and what its answer
// means. The card, the focus and the store are the DOM half's (m4); this module is a function of its
// inputs, so every decision can be read by a test without a document.
//
// The rules mirror the platform's (`backend/platform-api/src/auth/account-deletion.service.ts`). They are
// checked here so the button can stay disabled while the word is wrong, and still checked there, because
// the server is the authority over what a deletion is.
import type { Api } from '../api/client';
import { ApiError, failureOf, isRefused } from '../api/errors';

/** The word the platform takes, in either language: a token the server checks, not copy. */
export const CONFIRMATION_WORD = 'DELETE';

/** What the confirmation has on it right now. Both are kept as typed, never trimmed. */
export interface DeletionDraft {
  readonly confirmation: string;
  readonly password: string;
}

/** Why a deletion did not happen, as the confirmation card names it. */
export type DeletionRefusal =
  | 'confirmation'
  | 'password'
  | 'throttled'
  | 'signed-out'
  | 'offline'
  | 'unknown';

export type DeletionOutcome =
  | { readonly status: 'deleted' }
  | { readonly status: 'refused'; readonly reason: DeletionRefusal };

/**
 * Whether the form may be sent: the word exactly as the platform checks it, and a password only for an
 * account that has one. The comparison is exact and case-sensitive, with no trimming — a pasted
 * trailing space is a refusal on both sides, and a rule here that trimmed would be a button the server
 * then refuses.
 */
export function confirmationAccepted(draft: DeletionDraft, hasPassword: boolean): boolean {
  return draft.confirmation === CONFIRMATION_WORD && (!hasPassword || draft.password !== '');
}

/**
 * Asks the platform to delete the account. The password is left out of the body entirely when the
 * account has none, which is what lets an SSO-only account go on the word alone. Nothing here changes
 * the store, closes a card or navigates: the caller owns those, and a success is the caller's to act on.
 */
export async function deleteAccount(
  api: Api,
  draft: DeletionDraft,
  hasPassword: boolean,
): Promise<DeletionOutcome> {
  try {
    await api.deleteAccount(
      hasPassword
        ? { confirm: draft.confirmation, password: draft.password }
        : { confirm: draft.confirmation },
    );
    return { status: 'deleted' };
  } catch (error) {
    return { status: 'refused', reason: refusalOf(error) };
  }
}

/** The refusal the platform named, or the shape of a failure that named none. */
function refusalOf(error: unknown): DeletionRefusal {
  if (isRefused(error, 'invalid_confirmation')) return 'confirmation';
  if (isRefused(error, 'invalid_password')) return 'password';
  if (isRefused(error, 'too_many_attempts')) return 'throttled';
  // A cookie that outlived its account and no cookie at all are the same fact to the card: the session
  // is gone, and asking for a password cannot bring it back.
  if (error instanceof ApiError && error.status === 401) return 'signed-out';
  return failureOf(error) === 'offline' ? 'offline' : 'unknown';
}
